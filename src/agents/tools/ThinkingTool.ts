import { Tool } from '@langchain/core/tools';

interface ThinkingInput {
  thought: string;
}

/**
 * ThinkingTool allows the agent to organize its internal thought process
 * by writing out reasoning steps, considerations, or internal memos to self.
 * This tool helps the agent structure its thinking and maintain context
 * during complex reasoning tasks.
 *
 * Input: { "thought": string } or a plain string with the thought content
 * Output: Returns a confirmation that the thought was processed
 */
export class ThinkingTool extends Tool {
  name = 'Internal_Thinking';
  description = 'Allows the agent to write out internal thoughts, reasoning steps, or memos to self. Use this tool to organize your thinking process, note important considerations, or structure your approach to complex problems. Input: { "thought": string } or plain text with your thoughts.';

  /**
   * Processes the agent's internal thoughts and provides confirmation
   * @param input - JSON string with thought property or plain text thought
   * @returns Promise<string> - Confirmation message
   */
  async _call(input: string): Promise<string> {
    let thought: string;

    try {
      // Try to parse as JSON first
      const params: ThinkingInput = JSON.parse(input);
      if (params.thought && typeof params.thought === 'string') {
        thought = params.thought.trim();
      } else if (typeof input === 'string') {
        thought = input.trim();
      } else {
        return 'No thought provided. Please provide some content to think about.';
      }
    } catch (e) {
      // If not valid JSON, treat the entire input as the thought
      if (typeof input === 'string') {
        thought = input.trim();
      } else {
        return 'No thought provided. Please provide some content to think about.';
      }
    }

    if (!thought) {
      return 'No thought provided. Please provide some content to think about.';
    }

    // Log the thought for debugging purposes (optional)
    console.log(`[ThinkingTool] Agent thought: ${thought}`);

    // Return a confirmation that acknowledges the thought was processed
    // This helps the agent know the tool executed successfully
    return `Thought processed: "${thought}"\nContinuing with reasoning...`;
  }
}