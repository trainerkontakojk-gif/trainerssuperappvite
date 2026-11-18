import { randomUUID } from "crypto";
import { setTimeout as delay } from "node:timers/promises";
import { resolveModelProvider, supportsTemperature } from "./ai-models";
import { logAiUsage, UsageContext } from "./ai-usage";
import { sanitizeAiResponse } from "./ai-sanitize";
import type { OpenAIResponse } from "./openai";

/** SumoPod is an OpenAI-compatible gateway; only Chat Completions is used. */
const SUMOPOD_CHAT_URL = "https://ai.sumopod.com/v1/chat/completions";
const MAX_ATTEMPTS = 4;

type Content = { role: string; parts: { text: string }[] };
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ChatUsage = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
};
type ChatCompletion = {
  choices?: Array<{
    finish_reason?: unknown;
    message?: { content?: unknown; refusal?: unknown };
  }>;
  usage?: ChatUsage;
};

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function errorMessage(status: number): string {
  if (status === 401) return "API Key SumoPod tidak valid.";
  if (status === 402) return "Saldo SumoPod tidak cukup.";
  if (status === 403) return "SumoPod menolak akses.";
  if (status === 429) return "Server AI sedang sibuk. Coba lagi.";
  return `Gagal menghubungi server AI (Error ${status}).`;
}

function toMessages(
  systemInstruction: string | undefined,
  contents: Content[],
): ChatMessage[] | undefined {
  const messages: ChatMessage[] = systemInstruction
    ? [{ role: "system", content: systemInstruction }]
    : [];
  for (const content of contents) {
    const role =
      content.role === "model" || content.role === "assistant"
        ? "assistant"
        : content.role === "user"
          ? "user"
          : undefined;
    if (!role) return undefined;
    messages.push({
      role,
      content: content.parts.map((part) => part.text).join(" "),
    });
  }
  return messages;
}

export async function generateSumoPodContent(options: {
  model?: string;
  systemInstruction?: string;
  contents: Content[];
  temperature?: number;
  responseMimeType?: string;
  responseSchema?: unknown;
  usageContext?: UsageContext;
  userId?: string;
  sanitizeOutput?: boolean;
  signal?: AbortSignal;
}): Promise<OpenAIResponse> {
  const requestId = `sumopod-${randomUUID()}`;
  const apiKey = process.env.SUMOPOD_API_KEY?.trim();
  const { modelId, timeoutMs } = resolveModelProvider(options.model);
  const logTerminal = async (
    status: "success" | "failed" | "timeout",
    usage: ChatUsage = {},
    error?: string,
  ) => {
    if (!options.usageContext || !options.userId) return;
    const inputTokens = tokenCount(usage.prompt_tokens);
    const outputTokens = tokenCount(usage.completion_tokens);
    const totalTokens =
      tokenCount(usage.total_tokens) || inputTokens + outputTokens;
    await logAiUsage({
      requestId,
      userId: options.userId,
      provider: "sumopod",
      modelId,
      usageContext: options.usageContext,
      tokens:
        status === "success"
          ? { inputTokens, outputTokens, totalTokens }
          : { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      status,
      errorMessage: error,
    });
  };

  if (!apiKey) {
    const error = "SUMOPOD_API_KEY belum dikonfigurasi.";
    await logTerminal("failed", {}, error);
    return { success: false, error };
  }

  const messages = toMessages(options.systemInstruction, options.contents);
  if (!messages) {
    const error = "Format pesan AI tidak didukung.";
    await logTerminal("failed", {}, error);
    return { success: false, error };
  }

  const body: Record<string, unknown> = { model: modelId, messages };
  if (supportsTemperature(modelId)) {
    body.temperature = options.temperature ?? 0.7;
  }
  if (options.responseMimeType === "application/json") {
    body.response_format = options.responseSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: "response",
            strict: true,
            schema: options.responseSchema,
          },
        }
      : { type: "json_object" };
  }

  try {
    let response: Response | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      options.signal?.throwIfAborted();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs ?? 120_000);
      try {
        response = await fetch(SUMOPOD_CHAT_URL, {
          method: "POST",
          signal: options.signal
            ? AbortSignal.any([options.signal, controller.signal])
            : controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } finally {
        clearTimeout(timer);
      }
      options.signal?.throwIfAborted();
      if (
        response.ok ||
        (response.status !== 429 && response.status < 500) ||
        attempt === MAX_ATTEMPTS
      ) {
        break;
      }
      await delay(attempt * 500, undefined, { signal: options.signal });
    }

    if (!response?.ok) {
      const status = response?.status ?? 500;
      console.error(
        `[SumoPod] HTTP ${status}:`,
        response ? (await response.text()).slice(0, 500) : "",
      );
      options.signal?.throwIfAborted();
      const error = errorMessage(status);
      await logTerminal("failed", {}, error);
      return { success: false, error };
    }

    const data = (await response.json()) as ChatCompletion;
    options.signal?.throwIfAborted();
    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length") {
      const error = "Respons AI tidak lengkap. Coba lagi.";
      await logTerminal("failed", data.usage, error);
      return { success: false, error };
    }
    if (
      typeof choice?.message?.refusal === "string" &&
      choice.message.refusal
    ) {
      const error = "AI menolak memproses permintaan tersebut.";
      await logTerminal("failed", data.usage, error);
      return { success: false, error };
    }

    const content = choice?.message?.content;
    const rawText = typeof content === "string" ? content.trim() : "";
    if (!rawText) {
      const error = "AI tidak mengembalikan jawaban yang valid.";
      await logTerminal("failed", data.usage, error);
      return { success: false, error };
    }

    await logTerminal("success", data.usage);
    return {
      success: true,
      text:
        options.sanitizeOutput === false
          ? rawText
          : sanitizeAiResponse(rawText),
    };
  } catch (error) {
    console.error("[SumoPod] Error:", error);
    const cancelled = options.signal?.aborted === true;
    const timeout =
      cancelled ||
      (error instanceof DOMException && error.name === "AbortError");
    const reason = options.signal?.reason;
    const message = cancelled
      ? `cancelled: ${reason instanceof Error ? reason.message : String(reason)}`
      : timeout
        ? "Permintaan AI timeout. Coba lagi."
        : "Terjadi kesalahan koneksi ke server AI.";
    await logTerminal(timeout ? "timeout" : "failed", {}, message);
    return { success: false, error: message };
  }
}
