import path from 'path';
import { PromptTemplate } from '@langchain/core/prompts';
import {
  AppSession,
  AppServer, PhotoData,
  GIVE_APP_CONTROL_OF_TOOL_RESPONSE,
  logger as _logger
} from '@mentra/sdk';
import { MiraAgent } from './agents';
import { wrapText, TranscriptProcessor, LLMProvider } from './utils';
import { getAllToolsForUser } from './agents/tools/TpaTool';
import { Anim } from './utils/anim';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY;
const LOCATIONIQ_TOKEN = process.env.LOCATIONIQ_TOKEN;
const ALWAYS_LISTENING = process.env.ALWAYS_LISTENING !== 'false';

const PROCESSING_SOUND_URL = "https://mira.augmentos.cloud/popping.mp3";
const START_LISTENING_SOUND_URL = "https://mira.augmentos.cloud/start.mp3";

interface ProactiveDecision {
  shouldRespond: boolean;
  trigger: string;
  reason: string;
  confidence: number;
}

const PROACTIVE_LISTENER_PROMPT = `You review smart-glasses microphone transcripts to decide whether Mira should speak up.

Return **only** a JSON object with these keys:
- "should_respond": true or false
- "trigger": one of ["direct_request", "fact_check", "helpful_context", "safety", "notification", "fallback"]
- "confidence": a number from 0 to 1
- "reason": a short phrase explaining why

Mira is always listening but should only reply when she can add meaningful value:
1. Someone clearly addresses Mira or asks for help/information.
2. A statement needs fact-checking or clarification to prevent misinformation.
3. She can proactively surface urgent, safety-critical, or time-sensitive guidance.
4. Staying silent would cause the user to miss relevant information from their assistant or environment.

For casual chatter, private conversation, or noise, respond with should_respond = false. When unsure, lean toward silence.

Recent transcript window:
{recent_transcript}

Latest utterance under review:
{latest_utterance}`;

if (!AUGMENTOS_API_KEY) {
  throw new Error('AUGMENTOS_API_KEY is not set');
}

if (!PACKAGE_NAME) {
  throw new Error('PACKAGE_NAME is not set');
}

const logger = _logger.child({app: PACKAGE_NAME});
logger.info(`🚀🚀🚀 Starting ${PACKAGE_NAME} server on port ${PORT}... 🚀🚀🚀`);

// Wake words that trigger Mira
const explicitWakeWords = [
  "hey mira", "he mira", "hey mara", "he mara", "hey mirror", "he mirror",
  "hey miara", "he miara", "hey mia", "he mia", "hey mural", "he mural",
  "hey amira", "hey myra", "he myra", "hay mira", "hai mira", "hey-mira",
  "he-mira", "heymira", "heymara", "hey mirah", "he mirah", "hey meera", "he meera",
  "Amira", "amira", "a mira", "a mirror", "hey miller", "he miller", "hey milla", "he milla", "hey mila", "he mila",
  "hey miwa", "he miwa", "hey mora", "he mora", "hey moira", "he moira",
  "hey miera", "he miera", "hey mura", "he mura", "hey maira", "he maira",
  "hey meara", "he meara", "hey mara", "he mara", "hey mina", "he mina",
  "hey mirra", "he mirra", "hey mir", "he mir", "hey miro", "he miro",
  "hey miruh", "he miruh", "hey meerah", "he meerah", "hey meira", "he meira",
  "hei mira", "hi mira", "hey mere", "he mere", "hey murra", "he murra",
  "hey mera", "he mera", "hey neera", "he neera", "hey murah", "he murah",
  "hey mear", "he mear", "hey miras", "he miras", "hey miora", "he miora", "hey miri", "he miri",
  "hey maura", "he maura", "hey maya", "he maya", "hey moora", "he moora",
  "hey mihrah", "he mihrah", "ay mira", "ey mira", "yay mira", "hey mihra",
  "hey mera", "hey mira", "hey mila", "hey mirra",
];

/**
 * Manages notifications for users
 */
class NotificationsManager {
  private notificationsPerUser = new Map<string, any[]>();

  addNotifications(userId: string, notifications: any[]): void {
    if (!this.notificationsPerUser.has(userId)) {
      this.notificationsPerUser.set(userId, []);
    }
    // Append new notifications
    const existing = this.notificationsPerUser.get(userId)!;
    this.notificationsPerUser.set(userId, existing.concat(notifications));
  }

  getLatestNotifications(userId: string, count: number = 5): any[] {
    const all = this.notificationsPerUser.get(userId) || [];
    return all.slice(-count);
  }

  clearNotifications(userId: string): void {
    this.notificationsPerUser.delete(userId);
  }
}

const notificationsManager = new NotificationsManager();

/**
 * Manages the transcription state for active sessions
 */
class TranscriptionManager {
  private isProcessingQuery: boolean = false;
  private isListeningToQuery: boolean = false;
  private timeoutId?: NodeJS.Timeout;
  private maxListeningTimeoutId?: NodeJS.Timeout; // 15-second hard cutoff timer
  private session: AppSession;
  private sessionId: string;
  private userId: string;
  private miraAgent: MiraAgent;
  private transcriptionStartTime: number = 0;

  private serverUrl: string;
  private transcriptProcessor: TranscriptProcessor;
  private activePhotos: Map<string, { promise: Promise<PhotoData>, photoData: PhotoData | null, lastPhotoTime: number }> = new Map();
  private logger: AppSession['logger'];
  private readonly alwaysListeningDefault: boolean;

    /**
     * Tracks the last observed head position and a time window during which
     * a wake word will be accepted (only when the optional mode is enabled).
     * The window is started when the head position changes from 'down' -> 'up'.
     */
    private lastHeadPosition: string | null = null;
    private headWakeWindowUntilMs: number = 0;
    private transcriptionUnsubscribe?: () => void;
    private headWindowTimeoutId?: NodeJS.Timeout;

  constructor(session: AppSession, sessionId: string, userId: string, miraAgent: MiraAgent, serverUrl: string, alwaysListeningDefault: boolean) {
    this.session = session;
    this.sessionId = sessionId;
    this.userId = userId;
    this.miraAgent = miraAgent;
    this.serverUrl = serverUrl;
    // Use same settings as LiveCaptions for now
    this.transcriptProcessor = new TranscriptProcessor(30, 3, 3, false);
    this.logger = session.logger.child({ service: 'Mira.TranscriptionManager' });
    this.alwaysListeningDefault = alwaysListeningDefault;
    // Initialize subscription state based on setting
    this.initTranscriptionSubscription();
  }

  /**
   * Process incoming transcription data
   */
  handleTranscription(transcriptionData: any): void {
    // If a query is already being processed, ignore additional transcriptions
    if (this.isProcessingQuery) {
      this.logger.info(`[Session ${this.sessionId}]: Query already in progress. Ignoring transcription.`);
      return;
    }

    const text = transcriptionData.text;
    // Clean the text: lowercase and remove punctuation for easier matching
    const cleanedText = text
      .toLowerCase()
      .replace(/[.,!?;:]/g, '') // remove all punctuation
      .replace(/\s+/g, ' ')     // normalize whitespace
      .trim();
    const hasWakeWord = explicitWakeWords.some(word => cleanedText.includes(word));
    const wakeWordRequired = this.isWakeWordRequired();

      // Optional setting: only allow wake word within 10s after head moves down->up
      const requireHeadUpWindow = !!this.session.settings.get<boolean>('wake_requires_head_up');
      const now = Date.now();
      const withinHeadWindow = now <= this.headWakeWindowUntilMs;

      // Gate wake word if the optional mode is enabled
      if (!this.isListeningToQuery) {
        if (wakeWordRequired) {
          if (!hasWakeWord) {
            return;
          }
          if (requireHeadUpWindow && !withinHeadWindow) {
            // Wake word was spoken but not within the head-up window; ignore
            this.logger.debug('Wake word ignored: outside head-up activation window');
            return;
          }
        } else if (!cleanedText) {
          // Always-listening mode: wait until we have actual words to avoid
          // reacting to silence/noise-only transcripts.
          return;
        }
      }

    // if we have a photo and it's older than 5 seconds, delete it
    if (this.activePhotos.has(this.sessionId)) {
      const photo = this.activePhotos.get(this.sessionId);
      if (photo) {
        if (photo.lastPhotoTime + 5000 < Date.now()) {
          this.activePhotos.delete(this.sessionId);
        }
      }
    }

    if (!this.activePhotos.has(this.sessionId)) {
      // if we don't have a photo, get one
      if (this.session.capabilities?.hasCamera) {
        const getPhotoPromise = this.session.camera.requestPhoto({size: "small"});
        getPhotoPromise.then(photoData => {
          this.activePhotos.set(this.sessionId, {
            promise: getPhotoPromise,
            photoData: photoData,
            lastPhotoTime: Date.now()
          });
          setTimeout(() => {
            // if we have a photo and it's older than 30 seconds, delete it
            if (this.activePhotos.has(this.sessionId) && this.activePhotos.get(this.sessionId)?.promise == getPhotoPromise) {
              this.activePhotos.delete(this.sessionId);
            }
          }, 30000);
        }, error => {
          this.logger.error(error, `[Session ${this.sessionId}]: Error getting photo:`);
          this.activePhotos.delete(this.sessionId);
        });
        this.activePhotos.set(this.sessionId, {
          // promise: this.session.camera.requestPhoto(), // Keep original promise for compatibility
          promise: getPhotoPromise, // Keep original promise for compatibility
          photoData: null,
          lastPhotoTime: Date.now()
        });
      }
    }

    if (!this.isListeningToQuery) {
      // play new sound effect
      const hasScreenStart = this.session.capabilities?.hasDisplay;
      if (this.session.settings.get<boolean>("speak_response") || !hasScreenStart) {
        this.session.audio.playAudio({audioUrl: START_LISTENING_SOUND_URL});
      }
      try {
        this.session.location.getLatestLocation({accuracy: "high"}).then(location => {
          if (location) {
            this.handleLocation(location);
          }
        }, error => {
          console.warn(`[Session ${this.sessionId}]: Error getting location:`, error);
        });
      } catch (error) {
        console.warn(`[Session ${this.sessionId}]: Error getting location:`, error);
      }

      //todo _____________
      // Start 15-second maximum listening timer
      this.maxListeningTimeoutId = setTimeout(() => {
        console.log(`[Session ${this.sessionId}]: Maximum listening time (15s) reached, forcing query processing`);
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = undefined;
        }
        this.processQuery(text, 15000);
      }, 15000);
    }
//todo _____________


    this.isListeningToQuery = true;

    // If this is our first detection, start the transcription timer
    if (this.transcriptionStartTime === 0) {
      this.transcriptionStartTime = Date.now();
    }



    // Remove wake word for display
    const displayText = this.removeWakeWord(text);
    // Only show 'Listening...' if there is no text after the wake word and nothing has been shown yet
    if (displayText.trim().length === 0) {
      // Show 'Listening...' only if the last shown text was not 'Listening...'
      if (this.transcriptProcessor.getLastUserTranscript().trim().length !== 0) {
        this.transcriptProcessor.processString('', false); // Clear the partial
      }
      this.session.layouts.showTextWall("Listening...", { durationMs: 10000 });
    } else {
      // Show the live query as the user is talking
      let formatted = 'Listening...\n\n' + this.transcriptProcessor.processString(displayText, !!transcriptionData.isFinal).trim();
      // Add a listening indicator if not final
      this.session.layouts.showTextWall(formatted, { durationMs: 20000 });
    }

    let timerDuration: number;
    //todo _____________
    if (transcriptionData.isFinal) {
      // Check if the final transcript ends with a wake word when required
      if (wakeWordRequired && this.endsWithWakeWord(cleanedText)) {
        // If it ends with just a wake word, wait longer for additional query text
        this.logger.debug("transcriptionData.isFinal: ends with wake word");
        timerDuration = 10000;
      } else {
        // Final transcript with additional content should be processed soon
        timerDuration = 1500;
      }
    } else {
      //this.logger.debug("transcriptionData.isFinal: not final");
      // For non-final transcripts
      timerDuration = 3000;
    }

    // Clear any existing timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Set a new timeout to process the query
    this.timeoutId = setTimeout(() => {
      this.processQuery(text, timerDuration);
    }, timerDuration);
  }
  //todo _____________

  /**
   * Handle head position updates from the session. If the head transitions
   * from 'down' to 'up', open a 10s window during which the wake word will
   * activate listening (when the setting `wake_requires_head_up` is enabled).
   */
  public handleHeadPosition(headPositionData: any): void {
    try {
      // Derive a simple position string from provided data
      let current: string | null = null;
      if (typeof headPositionData === 'string') {
        current = headPositionData.toLowerCase();
      } else if (headPositionData && typeof headPositionData.position === 'string') {
        current = String(headPositionData.position).toLowerCase();
      }

      if (!current) {
        return;
      }

      const requireHeadUpWindow = !!this.session.settings.get<boolean>('wake_requires_head_up');
      if (!requireHeadUpWindow) {
        this.lastHeadPosition = current;
        return;
      }

      // Start window only on transition down -> up
      if (this.lastHeadPosition === 'down' && current === 'up') {
        this.headWakeWindowUntilMs = Date.now() + 10_000;
        this.logger.debug({ until: this.headWakeWindowUntilMs }, 'Head up detected: wake window opened for 10s');
        // Subscribe to transcriptions to listen for wake word during the window
        this.ensureTranscriptionSubscribed();
        // ALWAYS STAY SUBSCRIBED - DEBUGGING ISSUE
        if (this.headWindowTimeoutId) {
          clearTimeout(this.headWindowTimeoutId);
        }
        this.headWindowTimeoutId = setTimeout(() => {
          // if (!this.isListeningToQuery) {
          //   this.logger.debug('Head-up window expired without wake word; unsubscribing from transcriptions');
          //   this.ensureTranscriptionUnsubscribed();
          // }
          this.headWakeWindowUntilMs = 0;
          this.headWindowTimeoutId = undefined;
        }, 10_000);
      }

      this.lastHeadPosition = current;
    } catch (error) {
      this.logger.warn(error as Error, 'Failed to handle head position event');
    }
  }

  /**
   * Initialize subscription state based on the current setting.
   */
  public initTranscriptionSubscription(): void {
    // ALWAYS SUBSCRIBE - DEBUGGING ISSUE
    this.ensureTranscriptionSubscribed();
    // const requireHeadUpWindow = !!this.session.settings.get<boolean>('wake_requires_head_up');
    // if (requireHeadUpWindow) {
    //   // Start unsubscribed; will subscribe on head-up
    //   this.ensureTranscriptionUnsubscribed();
    // } else {
    //   // Normal mode: always subscribe
    //   this.ensureTranscriptionSubscribed();
    // }
  }

  private async getPhoto(): Promise<PhotoData | null> {
    if (this.activePhotos.has(this.sessionId)) {
      const photo = this.activePhotos.get(this.sessionId);
      if (photo && photo.photoData) {
        return photo.photoData;
      } else {
        if (photo?.promise) {
          // wait up to 3 seconds for promise to resolve
          this.logger.debug("Waiting for photo to resolve");
          const result = await Promise.race([photo.promise, new Promise<null>(resolve => setTimeout(resolve, 3000))]) as PhotoData | null;
          this.logger.debug(result, "Photo resolved");
          return result;
        } else {
          return null;
        }
      }
    }
    return null;
  }

  /**
  * Handles location updates with robust error handling
  * Gracefully falls back to default values if location services fail
  */
  public async handleLocation(locationData: any): Promise<void> {
    logger.debug({ locationData }, "$$$$$ Location data:");
    // Default fallback location context
    const fallbackLocationContext = {
      city: 'Unknown',
      state: 'Unknown',
      country: 'Unknown',
      timezone: {
        name: 'Unknown',
        shortName: 'Unknown',
        fullName: 'Unknown',
        offsetSec: 0,
        isDst: false
      }
    };

    try {
      const { lat, lng } = locationData;

      if (!lat || !lng) {
        this.logger.debug('Invalid location data received, using fallback');
        this.miraAgent.updateLocationContext(fallbackLocationContext);
        return;
      }

      let locationInfo = { ...fallbackLocationContext };

      try {
        // Use LocationIQ for reverse geocoding
        const response = await fetch(
          `https://us1.locationiq.com/v1/reverse.php?key=${LOCATIONIQ_TOKEN}&lat=${lat}&lon=${lng}&format=json`
        );

        if (response.ok) {
          const data = await response.json();
          const address = data.address;

          if (address) {
            locationInfo.city = address.city || address.town || address.village || 'Unknown city';
            locationInfo.state = address.state || 'Unknown state';
            locationInfo.country = address.country || 'Unknown country';
          }
        } else {
          console.warn(`LocationIQ reverse geocoding failed with status: ${response.status}`);
        }
      } catch (geocodingError) {
        console.warn('Reverse geocoding failed:', geocodingError);
      }

      try {
        // Get timezone information
        const timezoneResponse = await fetch(
          `https://us1.locationiq.com/v1/timezone?key=${LOCATIONIQ_TOKEN}&lat=${lat}&lon=${lng}&format=json`
        );

        if (timezoneResponse.ok) {
          const timezoneData = await timezoneResponse.json();

          if (timezoneData.timezone) {
            locationInfo.timezone = {
              name: timezoneData.timezone.name || 'Unknown',
              shortName: timezoneData.timezone.short_name || 'Unknown',
              fullName: timezoneData.timezone.full_name || 'Unknown',
              offsetSec: timezoneData.timezone.offset_sec || 0,
              isDst: !!timezoneData.timezone.now_in_dst
            };
          }
        } else {
          console.warn(`LocationIQ timezone API failed with status: ${timezoneResponse.status}`);
        }
      } catch (timezoneError) {
        console.warn('Timezone lookup failed:', timezoneError);
      }

      // Update the MiraAgent with location context (partial or complete)
      this.miraAgent.updateLocationContext(locationInfo);

      this.logger.debug(`User location: ${locationInfo.city}, ${locationInfo.state}, ${locationInfo.country}, ${locationInfo.timezone.name}`);
    } catch (error) {
      this.logger.error(error, 'Error processing location:');
      // Always update MiraAgent with fallback location context to ensure it continues working
      this.miraAgent.updateLocationContext(fallbackLocationContext);
    }
  }

  /**
   * Decide if Mira should respond while in always-listening mode.
   */
  private async shouldRespondToAmbientSpeech(query: string, segments: any[]): Promise<ProactiveDecision> {
    const fallbackDecision: ProactiveDecision = {
      shouldRespond: true,
      trigger: 'fallback',
      reason: 'Fallback allowance to avoid missing potential requests.',
      confidence: 0,
    };

    try {
      const contextWindow = Array.isArray(segments) && segments.length > 0
        ? segments.slice(-6).map((segment: any, index: number) => {
            const speaker = typeof segment.speaker === 'string'
              ? segment.speaker
              : typeof segment.role === 'string'
                ? segment.role
                : `utterance_${index + 1}`;
            const text = typeof segment.text === 'string'
              ? segment.text
              : segment?.content && typeof segment.content === 'string'
                ? segment.content
                : JSON.stringify(segment);
            return `${speaker}: ${text}`;
          }).join('\n')
        : query;

      const prompt = new PromptTemplate({
        template: PROACTIVE_LISTENER_PROMPT,
        inputVariables: ['recent_transcript', 'latest_utterance'],
      });

      const formattedPrompt = await prompt.format({
        recent_transcript: contextWindow || '(no prior context)',
        latest_utterance: query.trim() || '(empty)',
      });

      const llm = LLMProvider.getLLM();
      const response = await llm.invoke(formattedPrompt);
      const rawContent = typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? response.content.map((part: any) => {
              if (typeof part === 'string') {
                return part;
              }
              if (part?.type === 'text' && typeof part.text === 'string') {
                return part.text;
              }
              return '';
            }).join('')
          : String(response.content ?? '');

      let jsonText = rawContent.trim();
      if (jsonText.startsWith('```')) {
        const firstLineBreak = jsonText.indexOf('\n');
        if (firstLineBreak !== -1) {
          jsonText = jsonText.substring(firstLineBreak + 1).trim();
        }
        if (jsonText.endsWith('```')) {
          jsonText = jsonText.substring(0, jsonText.length - 3).trim();
        }
      }

      const parsed = JSON.parse(jsonText);
      const shouldRespondRaw = parsed.should_respond ?? parsed.shouldRespond ?? parsed.respond;
      const triggerRaw = parsed.trigger;
      const confidenceRaw = parsed.confidence;
      const reasonRaw = parsed.reason;

      const shouldRespond = typeof shouldRespondRaw === 'boolean'
        ? shouldRespondRaw
        : typeof shouldRespondRaw === 'string'
          ? shouldRespondRaw.toLowerCase() === 'true'
          : fallbackDecision.shouldRespond;

      const trigger = typeof triggerRaw === 'string' && triggerRaw.trim().length > 0
        ? triggerRaw.trim()
        : fallbackDecision.trigger;

      const parsedConfidence = typeof confidenceRaw === 'number'
        ? confidenceRaw
        : typeof confidenceRaw === 'string'
          ? parseFloat(confidenceRaw)
          : fallbackDecision.confidence;
      const confidence = Number.isFinite(parsedConfidence)
        ? Math.max(0, Math.min(1, parsedConfidence))
        : fallbackDecision.confidence;

      const reason = typeof reasonRaw === 'string' && reasonRaw.trim().length > 0
        ? reasonRaw.trim()
        : fallbackDecision.reason;

      const decision: ProactiveDecision = {
        shouldRespond,
        trigger,
        reason,
        confidence,
      };

      this.logger.debug({ decision, query }, `[Session ${this.sessionId}]: Proactive response gate decision.`);
      return decision;
    } catch (error) {
      this.logger.warn(error as Error, `[Session ${this.sessionId}]: Proactive response gate failed; defaulting to respond.`);
      return fallbackDecision;
    }
  }

  /**
   * Process and respond to the user's query
   *
   *
   */
  //todo : provide more timestamps from here to the final response form the ai
  // check if the the processQuery is being called all the time? and does it display in all cases 
  // when mira bbreaks and fails to display anything. determine if this function was called or not.
  private async processQuery(rawText: string, timerDuration: number): Promise<void> {
    const anim = new Anim(this.session); 
  
    logger.debug("processQuery called ");
    // Calculate the actual duration from transcriptionStartTime to now
    const endTime = Date.now();
    let durationSeconds = 3; // fallback default
    if (this.transcriptionStartTime > 0) {
      durationSeconds = Math.max(1, Math.ceil((endTime - this.transcriptionStartTime) / 1000));
    } else if (timerDuration) {
      durationSeconds = Math.max(1, Math.ceil(timerDuration / 1000));
    }

    // Use the calculated duration in the backend URL
    const backendUrl = `${this.serverUrl}/api/transcripts/${this.sessionId}?duration=${durationSeconds}`;

    let transcriptResponse: Response;
    let transcriptionResponse: any;

    try {
      this.logger.debug(`[Session ${this.sessionId}]: Fetching transcript from: ${backendUrl}`);
      transcriptResponse = await fetch(backendUrl);

      this.logger.debug(`[Session ${this.sessionId}]: Response status: ${transcriptResponse.status}`);

      if (!transcriptResponse.ok) {
        throw new Error(`HTTP ${transcriptResponse.status}: ${transcriptResponse.statusText}`);
      }

      const responseText = await transcriptResponse.text();
      this.logger.debug(`[Session ${this.sessionId}]: Raw response body:`, responseText);

      if (!responseText || responseText.trim() === '') {
        throw new Error('Empty response body received');
      }
      

      try {
        transcriptionResponse = JSON.parse(responseText);
      } catch (jsonError) {
        this.logger.error(jsonError, `[Session ${this.sessionId}]: JSON parsing failed:`);
        this.logger.error({ responseText }, `[Session ${this.sessionId}]: Response text that failed to parse: ${responseText}`);
        throw new Error(`Failed to parse JSON response`);
      }

    } catch (fetchError) {
      this.logger.error(fetchError, `[Session ${this.sessionId}]: Error fetching transcript:`);
      this.session.layouts.showTextWall(
        wrapText("Sorry, there was an error retrieving your transcript. Please try again.", 30),
        { durationMs: 5000 }
      );
      return;
    }

    if (!transcriptionResponse || !transcriptionResponse.segments || !Array.isArray(transcriptionResponse.segments)) {
      this.logger.error({ transcriptionResponse }, `[Session ${this.sessionId}]: Invalid response structure:`);
      this.session.layouts.showTextWall(
        wrapText("Sorry, the transcript format was invalid. Please try again.", 30),
        { durationMs: 5000 }
      );
      return;
    }

    const rawCombinedText = transcriptionResponse.segments.map((segment: any) => segment.text).join(' ');

    // Prevent multiple queries from processing simultaneously
    if (this.isProcessingQuery) {
      return;
    }

    this.isProcessingQuery = true;

    const wakeWordRequired = this.isWakeWordRequired();
    let isRunning = true;

    // Remove wake word from query when required
    const query = wakeWordRequired
      ? this.removeWakeWord(rawCombinedText)
      : rawCombinedText.trim();

    if (query.trim().length === 0) {
      isRunning = false;
      if (wakeWordRequired) {
        this.session.layouts.showTextWall(
          wrapText("No query provided.", 30),
          { durationMs: 5000 }
        );
        this.resetListeningState(0);
      } else {
        this.logger.debug(`[Session ${this.sessionId}]: Ambient speech ignored because it contained no actionable text.`);
        this.resetListeningState(0);
      }
      return;
    }

    let proactiveMetadata: { trigger: string; reason: string } = {
      trigger: 'direct_invocation',
      reason: 'User explicitly invoked Mira with a wake word or direct request.',
    };

    if (!wakeWordRequired) {
      const decision = await this.shouldRespondToAmbientSpeech(rawCombinedText.trim(), transcriptionResponse.segments);
      if (!decision.shouldRespond) {
        this.logger.info({ decision, query }, `[Session ${this.sessionId}]: Proactive gate suppressed response.`);
        this.resetListeningState(0);
        return;
      }
      proactiveMetadata = {
        trigger: decision.trigger || 'ambient_assist',
        reason: decision.reason || 'Assistant determined a proactive response would add value.',
      };
    }

    const hasScreenProcessing = this.session.capabilities?.hasDisplay;
    if (this.session.settings.get<boolean>("speak_response") || !hasScreenProcessing) {
      this.session.audio.playAudio({ audioUrl: PROCESSING_SOUND_URL }).then(() => {
        if (isRunning) {
          this.session.audio.playAudio({ audioUrl: PROCESSING_SOUND_URL }).then(() => {
            if (isRunning) {
              this.session.audio.playAudio({ audioUrl: PROCESSING_SOUND_URL }).then(() => {
                if (isRunning) {
                  this.session.audio.playAudio({ audioUrl: PROCESSING_SOUND_URL }).then(() => {
                    if (isRunning) {
                      this.session.audio.playAudio({ audioUrl: PROCESSING_SOUND_URL });
                    }
                  });
                }
              });
            }
          });
        }
      });
    }

    try {
      // Show the query being processed
      let displayQuery = query;
      if (displayQuery.length > 60) {
        displayQuery = displayQuery.slice(0, 60).trim() + ' ...';
      }
      anim.start("Processing query: " + displayQuery); // animiation stop
      this.session.layouts.showTextWall(
        wrapText("Processing query: " + displayQuery, 30),
        { durationMs: 8000 }
      );

      // Process the query with the Mira agent
      const notifications = notificationsManager.getLatestNotifications(this.userId, 5);
      const inputData = {
        query,
        photo: await this.getPhoto(),
        notifications,
        proactive_context: proactiveMetadata.reason,
        proactive_trigger: proactiveMetadata.trigger,
      };
      const agentResponse = await this.miraAgent.handleContext(inputData);

      anim.stop(); // animiation stop
      isRunning = false;

      if (!agentResponse) {
        this.logger.info("No insight found");
        this.showOrSpeakText("Sorry, I couldn't find an answer to that.");
      } else if (agentResponse === GIVE_APP_CONTROL_OF_TOOL_RESPONSE) {
        // the app is now in control, so don't do anything
      } else {
        let handled = false;
        if (typeof agentResponse === 'string') {
          try {
            const parsed = JSON.parse(agentResponse);

            // Generic event handler for tool outputs
            if (parsed && parsed.event) {
              switch (parsed.event) {
                // Add more cases here for future tool events
                // case 'notification':
                //   // handle notification event
                //   handled = true;
                //   break;
                default:
                  // Unknown event, fall through to default display
                  break;
              }
            }
          } catch (e) { /* not JSON, ignore */ }
        }

        if (!handled) {
          this.showOrSpeakText(agentResponse);
        }
      }
    } catch (error) {
      anim.stop();
      logger.error(error, `[Session ${this.sessionId}]: Error processing query:`);
      this.showOrSpeakText("Sorry, there was an error processing your request.");
    } finally {
      this.resetListeningState(2000);
    }
  }

  private async showOrSpeakText(text: string): Promise<void> {
    this.session.layouts.showTextWall(wrapText(text, 30), { durationMs: 5000 });
    const hasScreenProcess = this.session.capabilities?.hasDisplay;
    if (this.session.settings.get<boolean>("speak_response") || !hasScreenProcess) {
      try {
        const result = await this.session.audio.speak(text);
        if (result.error) {
          this.logger.error({ error: result.error }, `[Session ${this.sessionId}]: Error speaking text:`);
        }
      } catch (error) {
        this.logger.error(error, `[Session ${this.sessionId}]: Error speaking text:`);
      }
    }
  }

  /**
   * Subscribe to transcriptions if not already subscribed.
   */
  public ensureTranscriptionSubscribed(): void {
    if (this.transcriptionUnsubscribe) {
      return;
    }
    this.transcriptionUnsubscribe = this.session.events.onTranscription((transcriptionData) => {
      this.handleTranscription({
        ...transcriptionData,
        notifications: notificationsManager.getLatestNotifications(this.userId, 5)
      });
    });
  }

  /**
   * Unsubscribe from transcriptions to save battery when not needed.
   */
  public ensureTranscriptionUnsubscribed(): void {
    // NEVER UNSUBSCRIBE - DEBUGGING ISSUE
    return;
    // if (this.transcriptionUnsubscribe && !this.isListeningToQuery) {
    //   try {
    //     this.transcriptionUnsubscribe();
    //   } finally {
    //     this.transcriptionUnsubscribe = undefined;
    //   }
    // }
  }

  /**
   * Remove the wake word from the input text
   */
  private removeWakeWord(text: string): string {
    if (!this.isWakeWordRequired()) {
      return text.trim();
    }
    // Escape each wake word for regex special characters
    const escapedWakeWords = explicitWakeWords.map(word =>
      word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    // Build patterns that allow for spaces, commas, or periods between the words
    const wakePatterns = escapedWakeWords.map(word =>
      word.split(' ').join('[\\s,\\.]*')
    );
    // Create a regex that removes everything from the start until (and including) a wake word
    const wakeRegex = new RegExp(`.*?(?:${wakePatterns.join('|')})[\\s,\\.!]*`, 'i');
    return text.replace(wakeRegex, '').trim();
  }

  /**
   * Check if text ends with a wake word
   */
  private endsWithWakeWord(text: string): boolean {
    if (!this.isWakeWordRequired()) {
      return false;
    }
    // Remove trailing punctuation and whitespace, lowercase
    const cleanedText = text
      .toLowerCase()
      .replace(/[.,!?;:]/g, '') // remove all punctuation
      .replace(/\s+/g, ' ')     // normalize whitespace
      .trim();
    return explicitWakeWords.some(word => {
      // Build a regex to match the wake word at the end, allowing for punctuation/whitespace
      const pattern = new RegExp(`${word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i');
      return pattern.test(cleanedText);
    });
  }

  private isWakeWordRequired(): boolean {
    const alwaysListeningSetting = this.session.settings.get<boolean>('always_listening');
    if (typeof alwaysListeningSetting === 'boolean') {
      return !alwaysListeningSetting;
    }
    return !this.alwaysListeningDefault;
  }

  /**
   * Reset timers and state after finishing or skipping a query.
   */
  private resetListeningState(delayMs: number): void {
    this.transcriptionStartTime = 0;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    if (this.maxListeningTimeoutId) {
      clearTimeout(this.maxListeningTimeoutId);
      this.maxListeningTimeoutId = undefined;
    }

    this.isListeningToQuery = false;
    this.transcriptProcessor.clear();

    if (delayMs > 0) {
      setTimeout(() => {
        this.isProcessingQuery = false;
      }, delayMs);
    } else {
      this.isProcessingQuery = false;
    }
  }

  /**
   * Clean up resources when the session ends
   */
  cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    // Clear the maximum listening timer
    if (this.maxListeningTimeoutId) {
      clearTimeout(this.maxListeningTimeoutId);
    }

  }
}

// Utility to clean and convert ws(s)://.../tpa-ws to https://... for API calls
function getCleanServerUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  // Remove ws:// or wss://
  let url = rawUrl.replace(/^wss?:\/\//, '');
  // Remove trailing /tpa-ws
  url = url.replace(/\/app-ws$/, '');
  // Prepend https://
  return `https://${url}`;
}

/**
 * Main Mira TPA server class
 */
class MiraServer extends AppServer {
  private transcriptionManagers = new Map<string, TranscriptionManager>();
  private agentPerSession = new Map<string, MiraAgent>();

  /**
   * Handle new session connections
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    const logger = session.logger.child({ service: 'Mira.MiraServer' });
    logger.info(`Setting up Mira service for session ${sessionId}, user ${userId}`);

    const cleanServerUrl = getCleanServerUrl(session.getServerUrl());
    const agent = new MiraAgent(cleanServerUrl, userId);
    // Start fetching tools asynchronously without blocking
    getAllToolsForUser(cleanServerUrl, userId).then(tools => {
      // Append tools to agent when they're available
      if (tools.length > 0) {
        agent.agentTools.push(...tools);
        logger.info(`Added ${tools.length} user tools to agent for user ${userId}`);
      }
    }).catch(error => {
      logger.error(error, `Failed to load tools for user ${userId}:`);
    });
    this.agentPerSession.set(sessionId, agent);

    // Create transcription manager for this session
    const transcriptionManager = new TranscriptionManager(
      session, sessionId, userId, agent, cleanServerUrl, ALWAYS_LISTENING
    );
    this.transcriptionManagers.set(sessionId, transcriptionManager);

    // Welcome message
    // session.layouts.showReferenceCard(
    //   "Mira AI",
    //   "Virtual assistant connected",
    //   { durationMs: 3000 }
    // );

    // Do not subscribe globally to transcription in head-up mode.
    // Each TranscriptionManager manages its own subscription to save battery.

    // Handle head position changes (used for optional head-up wake window)
    session.events.onHeadPosition((headPositionData) => {
      const transcriptionManager = this.transcriptionManagers.get(sessionId);
      transcriptionManager?.handleHeadPosition(headPositionData);
    });
    // Also listen for setting changes to update subscription strategy dynamically
    session.settings.onChange((settings) => {
      const manager = this.transcriptionManagers.get(sessionId);
      manager?.initTranscriptionSubscription();
    });
    /*
    session.events.onLocation((locationData) => {
      const transcriptionManager = this.transcriptionManagers.get(sessionId);
      if (transcriptionManager) {
        transcriptionManager.handleLocation(locationData);
      }
    });
    */

    session.events.onPhoneNotifications((phoneNotifications) => {
      this.handlePhoneNotifications(phoneNotifications, sessionId, userId);
    });

    // Handle connection events
    /*
    session.events.onConnected((settings) => {
      logger.info(`\n[User ${userId}] connected to augmentos-cloud\n`);
    });
    */

    // Handle errors
    session.events.onError((error) => {
      logger.error(error, `[User ${userId}] Error: session error occurred`);
    });
  }

  private handlePhoneNotifications(phoneNotifications: any, sessionId: string, userId: string): void {
    // Save notifications for the user
    if (Array.isArray(phoneNotifications)) {
      notificationsManager.addNotifications(userId, phoneNotifications);
    } else if (phoneNotifications) {
      notificationsManager.addNotifications(userId, [phoneNotifications]);
    }
    // No need to update agent context here; notifications will be passed in userContext when needed
  }

  // Handle session disconnection
  protected onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    logger.info(`Stopping Mira service for session ${sessionId}, user ${userId}`);
    const manager = this.transcriptionManagers.get(sessionId);
    if (manager) {
      manager.cleanup();
      this.transcriptionManagers.delete(sessionId);
    }
    this.agentPerSession.delete(sessionId);
    return Promise.resolve();
  }
}

// Create and start the server
const server = new MiraServer({
  packageName: PACKAGE_NAME!,
  apiKey: AUGMENTOS_API_KEY!,
  port: PORT,
  webhookPath: '/webhook',
  publicDir: path.join(__dirname, './public')
});

server.start()
  .then(() => {
    logger.info(`${PACKAGE_NAME} server running`);
  })
  .catch(error => {
    logger.error(error, 'Failed to start server:');
  });


// Log any unhandled promise rejections or uncaught exceptions to help with debugging.
process.on('uncaughtException', (error) => {
  logger.error(error, '🥲 Uncaught Exception:');
  // Log the error, clean up resources, then exit gracefully
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason === "Photo request timed out") {
    return logger.warn("Photo request timed out, ignoring.");
  } else if (reason === "Location poll request timed out") {
    return logger.warn("Location poll request timed out, ignoring.");
  } else {
    logger.error({ reason, promise }, '🥲 Unhandled Rejection at:');
  }
  //process.exit(1);
});