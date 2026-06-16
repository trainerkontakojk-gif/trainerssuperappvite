import { randomUUID } from "crypto";
import { DEEPSEEK_MODELS } from "@trainers/types";
import { getProviderFromModelId } from "./ai-models";
import { logAiUsage, UsageContext } from "./ai-usage";
import { sanitizeAiResponse } from "./ai-sanitize";

export interface DeepSeekResponse {
  success: boolean;
  text?: string;
  error?: string;
}

export async function generateDeepSeekContent(options: {
  model?: string;
  systemInstruction?: string;
  contents: { role: string; parts: { text: string }[] }[];
  temperature?: number;
  responseMimeType?: string;
  usageContext?: UsageContext;
  userId?: string;
  sanitizeOutput?: boolean;
}): Promise<DeepSeekResponse> {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const modelId = options.model || "deepseek-v4-flash";
    if (!apiKey) {
      return {
        success: false,
        error: "DEEPSEEK_API_KEY is not set.",
      };
    }

    const messages: { role: string; content: string }[] = [];
    let systemMsg = options.systemInstruction || "";
    if (options.responseMimeType === "application/json") {
      systemMsg += "\n\nIMPORTANT: Respond in valid JSON format only.";
    }
    if (systemMsg) messages.push({ role: "system", content: systemMsg });

    for (const content of options.contents) {
      const role = content.role === "model" ? "assistant" : "user";
      messages.push({
        role,
        content: content.parts.map((p) => p.text).join(" "),
      });
    }

    const modelInfo = DEEPSEEK_MODELS.find((m) => m.id === modelId);
    const timeoutMs = modelInfo?.timeoutMs ?? 90_000;
    const maxAttempts = 4;
    let lastResponse: Response | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        lastResponse = await fetch(
          "https://api.deepseek.com/chat/completions",
          {
            method: "POST",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: modelId,
              messages,
              temperature: options.temperature ?? 0.7,
              response_format:
                options.responseMimeType === "application/json"
                  ? { type: "json_object" }
                  : undefined,
              thinking: { type: "disabled" },
            }),
          },
        );
      } finally {
        clearTimeout(timeoutId);
      }

      if (lastResponse.ok) break;
      if (lastResponse.status === 429 && attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2500 + attempt * 1500),
        );
        continue;
      }
      break;
    }

    if (!lastResponse?.ok) {
      const status = lastResponse?.status || 500;
      const errorText = lastResponse
        ? await lastResponse.text()
        : "No response";
      return {
        success: false,
        error: formatDeepSeekError(status, errorText),
      };
    }

    const data = await lastResponse.json();
    if (data.error) {
      return {
        success: false,
        error: data.error.message || "Model tidak tersedia.",
      };
    }

    const choice = data.choices?.[0];
    const rawContent = choice?.message?.content || "";
    const shouldSanitize = options.sanitizeOutput !== false;
    const text = shouldSanitize ? sanitizeAiResponse(rawContent) : rawContent;

    if (options.usageContext && options.userId) {
      const usage = data.usage;
      if (usage) {
        const inputTokens =
          typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
        const outputTokens =
          typeof usage.completion_tokens === "number"
            ? usage.completion_tokens
            : 0;
        const totalTokens =
          typeof usage.total_tokens === "number"
            ? usage.total_tokens
            : inputTokens + outputTokens;

        if (inputTokens > 0 || outputTokens > 0) {
          await logAiUsage({
            requestId: `deepseek-${randomUUID()}`,
            userId: options.userId,
            provider: getProviderFromModelId(modelId),
            modelId,
            usageContext: options.usageContext,
            tokens: { inputTokens, outputTokens, totalTokens },
          });
        }
      }
    }

    return { success: true, text };
  } catch (error) {
    console.error("[DeepSeek] Error:", error);
    return { success: false, error: "Terjadi kesalahan koneksi ke server AI." };
  }
}

function parseDeepSeekErrorMessage(errorText: string): string | undefined {
  try {
    const parsed = JSON.parse(errorText) as {
      error?: { message?: unknown };
    };
    return typeof parsed.error?.message === "string"
      ? parsed.error.message
      : undefined;
  } catch {
    return undefined;
  }
}

function formatDeepSeekError(status: number, errorText: string): string {
  const detail = parseDeepSeekErrorMessage(errorText);

  if (status === 429) {
    return "Server AI sedang sibuk. Coba lagi.";
  }
  if (status === 401) {
    return detail
      ? `API Key DeepSeek tidak valid: ${detail}`
      : "API Key DeepSeek tidak valid.";
  }
  if (status === 402) {
    return detail
      ? `Kredit DeepSeek tidak cukup: ${detail}`
      : "Kredit DeepSeek tidak cukup.";
  }
  if (status === 403) {
    return detail
      ? `DeepSeek menolak akses: ${detail}`
      : "DeepSeek menolak akses.";
  }

  return detail || `Gagal menghubungi server AI (Error ${status}).`;
}
