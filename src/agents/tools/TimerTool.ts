import { Tool } from '@langchain/core/tools';
import { randomUUID } from 'crypto';

interface TimerInput {
  duration: number; // in seconds
}

function parseDurationFromText(text: string): { duration: number | null } {
  // Match patterns like '30 seconds', '2 minutes', '1 min', '45s', '10m', etc.
  const regex = /([0-9]+)\s*(seconds?|secs?|s|minutes?|mins?|m)/i;
  const match = text.match(regex);
  if (!match) return { duration: null };
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  let duration = 0;
  if (unit.startsWith('m')) {
    duration = value * 60;
  } else {
    duration = value;
  }
  return { duration };
}

/**
 * TimerTool allows the agent to set a timer for a specified duration.
 * Input: { "duration": number (seconds) }
 * Output: Returns a JSON string: { event: "timer_set", duration, timerId }
 */
export class TimerTool extends Tool {
  name = 'Timer';
  description = 'Sets a timer for a specified duration in seconds or minutes. Input: { "duration": number (seconds) }. Use this tool when a user asks to set a timer or alarm.';

  async _call(input: string): Promise<string> {
    let params: TimerInput | null = null;
    // Try JSON first
    try {
      params = JSON.parse(input);
    } catch (e) {
      // Not JSON, try to parse natural language
      const parsed = parseDurationFromText(input);
      if (parsed.duration) {
        params = { duration: parsed.duration };
      }
    }
    if (!params || !params.duration || typeof params.duration !== 'number' || params.duration <= 0) {
      return JSON.stringify({ error: 'Invalid input. Please specify a duration (e.g., "30 seconds" or { "duration": 30 }).' });
    }
    const { duration } = params;
    const timerId = randomUUID();
    return JSON.stringify({ event: 'timer_set', duration, timerId });
  }
} 