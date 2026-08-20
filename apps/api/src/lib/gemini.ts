import { Content, Modality } from "@google/genai";
import { randomUUID } from "crypto";
import {
  AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  getGeminiClient,
  getProviderFromModelId,
} from "./ai-models";
import { logAiUsage, UsageContext } from "./ai-usage";
import { sanitizeAiResponse } from "./ai-sanitize";

export interface GeminiResponse {
  success: boolean;
  text?: string;
  images?: string[];
  error?: string;
}

function resolveResponseText(response: {
  text?: unknown;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string {
  if (typeof response.text === "function") {
    try {
      return (response as { text: () => string }).text();
    } catch {
      /* fallthrough */
    }
  }
  if (typeof response.text === "string") {
    return response.text;
  }
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

function resolveResponseImages(response: any): string[] {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p: any) => p.inlineData)
    .map(
      (p: any) => `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
    );
}

export async function generateGeminiContent(options: {
  model?: string;
  systemInstruction?: string;
  contents: Content[];
  responseMimeType?: string;
  responseSchema?: any;
  responseModalities?: Modality[];
  temperature?: number;
  usageContext?: UsageContext;
  userId?: string;
  sanitizeOutput?: boolean;
}): Promise<GeminiResponse> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const ai = getGeminiClient();
    const modelName = options.model || DEFAULT_AI_MODEL_ID;
    const supportsSystemInstruction = !modelName.includes(
      "gemini-3-flash-preview",
    );

    let systemInstruction: string | undefined;
    let contents = options.contents;

    if (options.systemInstruction) {
      if (supportsSystemInstruction) {
        systemInstruction = options.systemInstruction;
      } else {
        contents = injectSystemInstructionIntoContents(
          options.contents,
          options.systemInstruction,
        );
      }
    }

    const modelInfo = AI_MODELS.find((m) => m.id === modelName);
    const timeoutMs = modelInfo?.timeoutMs ?? 120_000;

    const generateWithTimeout = async () => {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Gemini request timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      );
      return await Promise.race([
        ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            responseMimeType: options.responseMimeType,
            responseSchema: options.responseSchema,
            responseModalities: options.responseModalities,
            temperature: options.temperature ?? 0.7,
          } as any,
        }),
        timeoutPromise,
      ]);
    };

    let response: any;
    try {
      response = await generateWithTimeout();
    } catch (firstError: unknown) {
      const err = firstError as { message?: string };
      if (
        err?.message?.includes("Developer instruction is not enabled") &&
        options.systemInstruction &&
        supportsSystemInstruction
      ) {
        console.warn(
          `[Gemini] Model "${modelName}" does not support developer instruction. Injecting into contents.`,
        );
        contents = injectSystemInstructionIntoContents(
          options.contents,
          options.systemInstruction,
        );
        const retryTimeout = new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`Gemini request timed out after ${timeoutMs}ms`),
              ),
            timeoutMs,
          ),
        );
        response = await Promise.race([
          ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              responseMimeType: options.responseMimeType,
              responseSchema: options.responseSchema,
              responseModalities: options.responseModalities,
              temperature: options.temperature ?? 0.7,
            } as any,
          }),
          retryTimeout,
        ]);
      } else {
        throw firstError;
      }
    }

    if (options.usageContext && options.userId) {
      const usage = (response as { usageMetadata?: Record<string, unknown> })
        ?.usageMetadata;
      if (usage) {
        const inputTokens =
          typeof usage.promptTokenCount === "number"
            ? usage.promptTokenCount
            : 0;
        const outputTokens =
          typeof usage.candidatesTokenCount === "number"
            ? usage.candidatesTokenCount
            : 0;
        const totalTokens =
          typeof usage.totalTokenCount === "number"
            ? usage.totalTokenCount
            : inputTokens + outputTokens;

        if (inputTokens > 0 || outputTokens > 0) {
          await logAiUsage({
            requestId: `gemini-${randomUUID()}`,
            userId: options.userId,
            provider: getProviderFromModelId(modelName),
            modelId: modelName,
            usageContext: options.usageContext,
            tokens: { inputTokens, outputTokens, totalTokens },
          });
        }
      }
    }

    const rawText = resolveResponseText(response);
    const images = resolveResponseImages(response);
    const shouldSanitize = options.sanitizeOutput !== false;
    return {
      success: true,
      text: shouldSanitize ? sanitizeAiResponse(rawText) : rawText,
      images: images.length > 0 ? images : undefined,
    };
  } catch (error) {
    console.error("[Gemini] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function injectSystemInstructionIntoContents(
  contents: Content[],
  systemInstruction?: string,
): Content[] {
  if (!systemInstruction) return contents;
  const boundary = `BLOCK_${randomUUID().replace(/-/g, "")}`;
  const instructionText = `\n[SYSTEM_CONTEXT_START:${boundary}]\n${systemInstruction}\n[SYSTEM_CONTEXT_END:${boundary}]\n\n[USER_INPUT_START:${boundary}]\n`;
  const footerText = `\n[USER_INPUT_END:${boundary}]`;

  const cloned = [...contents];
  const firstUserIdx = cloned.findIndex(
    (c) => c?.role === "user" && Array.isArray(c?.parts),
  );
  if (firstUserIdx >= 0) {
    const firstUser = { ...cloned[firstUserIdx] };
    const firstParts = [...(firstUser.parts || [])];
    const firstTextIdx = firstParts.findIndex(
      (p) => typeof p?.text === "string",
    );
    if (firstTextIdx >= 0) {
      firstParts[firstTextIdx] = {
        ...firstParts[firstTextIdx],
        text: `${instructionText}${(firstParts[firstTextIdx].text || "").trim()}${footerText}`,
      };
    } else {
      firstParts.unshift({ text: instructionText });
      firstParts.push({ text: footerText });
    }
    firstUser.parts = firstParts;
    cloned[firstUserIdx] = firstUser;
  } else {
    cloned.unshift({
      role: "user",
      parts: [{ text: instructionText }, { text: footerText }],
    });
  }
  return cloned;
}
