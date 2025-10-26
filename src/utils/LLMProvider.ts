import { ChatOpenAI } from "@langchain/openai";

const QWEN_API_BASE_URL =
  process.env.QWEN_API_BASE_URL ||
  process.env.LM_STUDIO_BASE_URL ||
  "http://localhost:1234/v1";
const QWEN_API_KEY = process.env.QWEN_API_KEY || process.env.LM_STUDIO_API_KEY || "qwen";

// LLM Configuration
export enum LLMModel {
  QWEN_3_4B_2507 = 'qwen/qwen3-4b-2507',
}

export const LLM_MODEL: LLMModel | string = process.env.LLM_MODEL || LLMModel.QWEN_3_4B_2507;

export class LLMProvider {
  static getLLM() {
    const model = typeof LLM_MODEL === 'string' ? (LLM_MODEL as LLMModel) : LLM_MODEL;

    if (model !== LLMModel.QWEN_3_4B_2507) {
      throw new Error(`Unsupported Qwen model: ${model}`);
    }

    return new ChatOpenAI({
      modelName: model,
      temperature: 0.3,
      maxTokens: 300,
      openAIApiKey: QWEN_API_KEY,
      configuration: {
        baseURL: QWEN_API_BASE_URL,
      },
    });
  }
}
