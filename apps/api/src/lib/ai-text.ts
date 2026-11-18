import type { AIProvider } from "@trainers/types";
import { generateOpenAIContent } from "./openai";
import { generateSumoPodContent } from "./sumopod";

/** Providers that speak an OpenAI-style API (everything except Gemini). */
export type CompatibleAIProvider = Exclude<AIProvider, "gemini">;

/**
 * Routes a text request to an OpenAI-style provider, so call sites keep one
 * Gemini branch and one non-Gemini branch.
 */
export function generateCompatibleContent(
  provider: CompatibleAIProvider,
  options: Parameters<typeof generateOpenAIContent>[0],
) {
  return provider === "sumopod"
    ? generateSumoPodContent(options)
    : generateOpenAIContent(options);
}
