import path from 'path';
import {
  TpaSession,
  TpaServer
} from '@augmentos/sdk';
import { MiraAgent } from './agents';
import { wrapText } from './utils';
import { getAllToolsForUser } from './agents/tools/TpaTool';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY;
const LOCATIONIQ_TOKEN = process.env.LOCATIONIQ_TOKEN

if (!AUGMENTOS_API_KEY) {
  throw new Error('AUGMENTOS_API_KEY is not set');
}

if (!PACKAGE_NAME) {
  throw new Error('PACKAGE_NAME is not set');
}

console.log(`Starting ${PACKAGE_NAME} server on port ${PORT}...`);
console.log(`Using API key: ${AUGMENTOS_API_KEY}`);

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
  "hey mera", "hey mira", "hey mila", "hey mirra"
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
  private timeoutId?: NodeJS.Timeout;
  private session: TpaSession;
  private sessionId: string;
  private userId: string;
  private miraAgent: MiraAgent;
  private transcriptionStartTime: number = 0;
  private activeTimers: Map<string, NodeJS.Timeout> = new Map(); // timerId -> timeoutId
  private serverUrl: string;

  constructor(session: TpaSession, sessionId: string, userId: string, miraAgent: MiraAgent, serverUrl: string) {
    this.session = session;
    this.sessionId = sessionId;
    this.userId = userId;
    this.miraAgent = miraAgent;
    this.serverUrl = serverUrl;
  }

  /**
   * Process incoming transcription data
   */
  handleTranscription(transcriptionData: any): void {
    // If a query is already being processed, ignore additional transcriptions
    if (this.isProcessingQuery) {
      console.log(`[Session ${this.sessionId}]: Query already in progress. Ignoring transcription.`);
      return;
    }

    const text = transcriptionData.text;
    // Clean the text: lowercase and remove punctuation for easier matching
    const cleanedText = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const hasWakeWord = explicitWakeWords.some(word => cleanedText.includes(word));


    // console.log(`[Session ${this.sessionId}]: Transcription data: ${cleanedText}`);
    // console.log(`[Session ${this.sessionId}]: Has wake word: ${hasWakeWord}`);

    if (!hasWakeWord) {
      console.log('No wake word detected');
      return;
    }

    // console.log(`[Session ${this.sessionId}]: Wake word detected in text "${text}"`);

    // If this is our first detection, start the transcription timer
    if (this.transcriptionStartTime === 0) {
      this.transcriptionStartTime = Date.now();
    }

    // Send immediate display feedback
    this.session.layouts.showTextWall(
      "Listening...",
      { durationMs: 10000 }
    );

    let timerDuration: number;

    if (transcriptionData.isFinal) {
      // console.log("$$$$$ transcriptionData.isFinal:", transcriptionData.isFinal);
      // Check if the final transcript ends with a wake word
      if (this.endsWithWakeWord(cleanedText)) {
        // If it ends with just a wake word, wait longer for additional query text
        console.log("$$$$$ transcriptionData.isFinal: ends with wake word");
        timerDuration = 8000;
      } else {
        console.log("$$$$$ transcriptionData.isFinal: does not end with wake word");
        // Final transcript with additional content should be processed soon
        timerDuration = 1500;
      }
    } else {
      console.log("$$$$$ transcriptionData.isFinal: not final");
      // For non-final transcripts
      timerDuration = 3000;
    }

    // Clear any existing timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Set a new timeout to process the query
    this.timeoutId = setTimeout(() => {
      // Pass the timerDuration for fallback, but processQuery will calculate the real duration
      this.processQuery(text, timerDuration);
    }, timerDuration);
  }

  /**
   * Process and respond to the user's query
   */
  private async processQuery(rawText: string, timerDuration: number): Promise<void> {
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
    const transcriptResponse = await fetch(backendUrl);
    const transcriptionResponse = await transcriptResponse.json();

    console.log("$$$$$ Backend URL:", backendUrl);
    console.log("$$$$$ Transcript response:", transcriptResponse);
    console.log("$$$$$ Transcription response:", transcriptionResponse);

    const rawCombinedText = transcriptionResponse.segments.map((segment: any) => segment.text).join(' ');
    // console.log(`Raw combined text: ${rawCombinedText}`);
    // console.log(`Transcription data: ${rawText}`);

    // Prevent multiple queries from processing simultaneously
    if (this.isProcessingQuery) {
      return;
    }

    this.isProcessingQuery = true;

    try {
      // Remove wake word from query
      const query = this.removeWakeWord(rawCombinedText);
      console.log(`[Session ${this.sessionId}]: Processing query: "${query}"`);

      console.log(`[Session ${this.sessionId}]: Processing query: "${query}"`);

      if (query.trim().length === 0) {
        this.session.layouts.showTextWall(
          wrapText("No query provided", 30),
          { durationMs: 5000 }
        );
        return;
      }

      // Show the query being processed
      this.session.layouts.showTextWall(
        wrapText("Processing query: " + query, 30),
        { durationMs: 8000 }
      );

      // Process the query with the Mira agent
      const inputData = { query };
      const agentResponse = await this.miraAgent.handleContext(inputData);

      if (!agentResponse) {
        console.log("No insight found");
        this.session.layouts.showTextWall(
          wrapText("Sorry, I couldn't find an answer to that.", 30),
          { durationMs: 5000 }
        );
      } else {
        let handled = false;
        if (typeof agentResponse === 'string') {
          try {
            const parsed = JSON.parse(agentResponse);

            // Generic event handler for tool outputs
            if (parsed && parsed.event) {
              switch (parsed.event) {
                case 'timer_set':
                  if (parsed.duration) {
                    const labelText = parsed.label ? ` for "${parsed.label}"` : '';
                    this.session.layouts.showTextWall(
                      wrapText(`Timer set${labelText} for ${parsed.duration} seconds.`, 30),
                      { durationMs: 5000 }
                    );
                    const timeout = setTimeout(() => {
                      this.session.layouts.showTextWall(
                        wrapText(`Timer${labelText} is up!`, 30),
                        { durationMs: 8000 }
                      );
                      this.activeTimers.delete(parsed.timerId);
                    }, parsed.duration * 1000);
                    this.activeTimers.set(parsed.timerId, timeout);
                    handled = true;
                  }
                  break;
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
          this.session.layouts.showTextWall(
            wrapText(agentResponse, 30),
            { durationMs: 8000 }
          );
        }
      }
    } catch (error) {
      console.error(`[Session ${this.sessionId}]: Error processing query:`, error);
      this.session.layouts.showTextWall(
        wrapText("Sorry, there was an error processing your request.", 30),
        { durationMs: 5000 }
      );
    } finally {
      // Reset the state for future queries
      this.transcriptionStartTime = 0;
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = undefined;
      }

      // Reset processing state after a delay
      setTimeout(() => {
        this.isProcessingQuery = false;
      }, 1000);
    }
  }

  /**
   * Remove the wake word from the input text
   */
  private removeWakeWord(text: string): string {
    // Escape each wake word for regex special characters
    const escapedWakeWords = explicitWakeWords.map(word =>
      word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    // Build patterns that allow for spaces, commas, or periods between the words
    const wakePatterns = escapedWakeWords.map(word =>
      word.split(' ').join('[\\s,\\.]*')
    );
    // Create a regex that removes everything from the start until (and including) a wake word
    const wakeRegex = new RegExp(`.*?(?:${wakePatterns.join('|')})[\\s,\\.]*`, 'i');
    return text.replace(wakeRegex, '').trim();
  }

  /**
   * Check if text ends with a wake word
   */
  private endsWithWakeWord(text: string): boolean {
    // Remove trailing punctuation and whitespace, lowercase
    const cleanedText = text.trim().replace(/[\s.,!?;:]+$/, '').toLowerCase();
    return explicitWakeWords.some(word => {
      // Build a regex to match the wake word at the end, allowing for punctuation/whitespace
      const pattern = new RegExp(`${word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i');
      return pattern.test(cleanedText);
    });
  }

  /**
   * Clean up resources when the session ends
   */
  cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    // Clear all active timers
    for (const timeout of this.activeTimers.values()) {
      clearTimeout(timeout);
    }
    this.activeTimers.clear();
  }
}

/**
 * Main Mira TPA server class
 */
class MiraServer extends TpaServer {
  private transcriptionManagers = new Map<string, TranscriptionManager>();
  private agentPerSession = new Map<string, MiraAgent>();

  /**
   * Handle new session connections
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`Setting up Mira service for session ${sessionId}, user ${userId}`);

    console.log("$$$$$ Server URL:", session.getServerUrl());

    const agent = new MiraAgent(userId);
    // Start fetching tools asynchronously without blocking
    getAllToolsForUser(userId).then(tools => {
      // Append tools to agent when they're available
      if (tools.length > 0) {
        agent.agentTools.push(...tools);
        console.log(`Added ${tools.length} user tools to agent for user ${userId}`);
      }
    }).catch(error => {
      console.error(`Failed to load tools for user ${userId}:`, error);
    });
    this.agentPerSession.set(sessionId, agent);

    // console.log("$$$$$ Agent:", agent.agentTools);

    // Create transcription manager for this session
    const transcriptionManager = new TranscriptionManager(
      session, sessionId, userId, agent, session.getServerUrl() || ''
    );
    this.transcriptionManagers.set(sessionId, transcriptionManager);

    // Welcome message
    // session.layouts.showReferenceCard(
    //   "Mira AI", 
    //   "Virtual assistant connected", 
    //   { durationMs: 3000 }
    // );

    // Handle transcription data
    session.events.onTranscription((transcriptionData) => {
      const transcriptionManager = this.transcriptionManagers.get(sessionId);
      if (transcriptionManager) {
        // Attach notifications to MiraAgent for context by passing them in userContext
        transcriptionManager.handleTranscription({
          ...transcriptionData,
          notifications: notificationsManager.getLatestNotifications(userId, 5)
        });
      }
    });

    session.events.onLocation((locationData) => {
      this.handleLocation(locationData, sessionId);
    });

    session.events.onPhoneNotifications((phoneNotifications) => {
      // console.log("$$$$$ Phone notifications:", phoneNotifications);
      this.handlePhoneNotifications(phoneNotifications, sessionId, userId);
    });

    // Handle connection events
    session.events.onConnected((settings) => {
      console.log(`\n[User ${userId}] connected to augmentos-cloud\n`);
    });

    // Handle errors
    session.events.onError((error) => {
      console.error(`[User ${userId}] Error:`, error);
    });
  }

  private async handleLocation(locationData: any, sessionId: string): Promise<void> {
    try {
      // console.log("$$$$$ Location data:", JSON.stringify(locationData));
      const { lat, lng } = locationData;

      // console.log(`Location data: ${JSON.stringify(locationData)}`);
      
      if (!lat || !lng) {
        console.log('Invalid location data received');
        return;
      }

      // Use LocationIQ for reverse geocoding
      const response = await fetch(
        `https://us1.locationiq.com/v1/reverse.php?key=${LOCATIONIQ_TOKEN}&lat=${lat}&lon=${lng}&format=json`
      );
      // console.log("$$$$$ Response:", response);
      if (!response.ok) {
        throw new Error('Failed to fetch location data');
      }

      const data = await response.json();
      // console.log("$$$$$ Location data:", JSON.stringify(data));
      
      // Extract relevant location information
      const address = data.address;
      const locationInfo = {
        city: address.city || address.town || address.village || 'Unknown city',
        state: address.state || 'Unknown state',
        country: address.country || 'Unknown country'
      };

      // Update the MiraAgent with location context
      this.agentPerSession.get(sessionId)?.updateLocationContext(locationInfo);
      
      // console.log(`User location: ${locationInfo.city}, ${locationInfo.state}, ${locationInfo.country}`);
    } catch (error) {
      console.error('Error processing location:', error);
      // Update MiraAgent with fallback location context
      this.agentPerSession.get(sessionId)?.updateLocationContext({
        city: 'Unknown',
        state: 'Unknown',
        country: 'Unknown'
      });
    }
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
    console.log(`Stopping Mira service for session ${sessionId}, user ${userId}`);
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
    console.log(`${PACKAGE_NAME} server running`);
  })
  .catch(error => {
    console.error('Failed to start server:', error);
  });