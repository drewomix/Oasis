import { StructuredTool } from '@langchain/core/tools';
import { randomUUID } from 'crypto';
import { z } from 'zod';

// Define the input schema using zod
const TimerInputSchema = z.object({
  duration: z.number().positive().describe('Duration in seconds (must be a positive number)'),
  label: z.string().optional().describe('Optional name or label for the timer'),
});

// Type for the timer input based on the schema
type TimerInput = z.infer<typeof TimerInputSchema>;

/**
 * Parses duration from natural language text (helper function for backward compatibility)
 * @param text - Natural language text containing duration
 * @returns Parsed duration object
 */
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
 * TimerTool allows the agent to set a timer for a specified duration with an optional label.
 * Input: { "duration": number (seconds), "label"?: string (optional name) }
 * Output: Returns a JSON string: { event: "timer_set", duration, timerId, label? }
 */
export class TimerTool extends StructuredTool {
  name = 'Timer';
  description = 'Sets a timer for a specified duration in seconds with an optional label. Input: { "duration": number (seconds), "label"?: string (optional name) }. Use this tool when a user asks to set a timer or alarm.';
  schema = TimerInputSchema;

  /**
   * Sets a timer for a specified duration in seconds with an optional label.
   * @param input - Object with duration property (number of seconds) and optional label
   * @returns JSON string with timer_set event, duration, timerId, and optional label
   */
  async _call(input: TimerInput): Promise<string> {
    const { duration, label } = input;

    // Validate that duration is a positive number
    if (!duration || typeof duration !== 'number' || duration <= 0) {
      return JSON.stringify({
        error: 'Invalid input. Duration must be a positive number in seconds.'
      });
    }

    const timerId = randomUUID();

    // Build the response object
    const response: {
      event: string;
      duration: number;
      timerId: string;
      label?: string;
    } = {
      event: 'timer_set',
      duration,
      timerId
    };

    // Include label if provided
    if (label && label.trim() !== '') {
      response.label = label.trim();
    }

    return JSON.stringify(response);
  }
}