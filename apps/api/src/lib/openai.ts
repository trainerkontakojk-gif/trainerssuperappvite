import { randomUUID } from "crypto";
import { resolveModelProvider, supportsTemperature } from "./ai-models";
import { logAiUsage, UsageContext } from "./ai-usage";
import { sanitizeAiResponse } from "./ai-sanitize";

export interface OpenAIResponse {
  success: boolean;
  text?: string;
  error?: string;
}

type Content = { role: string; parts: { text: string }[] };

type InputMessage = { role: "user" | "assistant"; content: string };
type ResponsesUsage = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
};
type ResponsesData = {
  status?: unknown;
  incomplete_details?: unknown;
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      type?: unknown;
      text?: unknown;
      refusal?: unknown;
    }>;
  }>;
  usage?: ResponsesUsage;
};

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function extractText(data: ResponsesData): string {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter(
      (part) => part.type === "output_text" && typeof part.text === "string",
    )
    .map((part) => part.text as string)
    .join("");
}

function hasRefusal(data: ResponsesData): boolean {
  return (data.output ?? []).some((item) =>
    (item.content ?? []).some((part) => part.type === "refusal"),
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function errorMessage(status: number, body: string): string {
  let detail: string | undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      parsed.error &&
      typeof parsed.error === "object" &&
      "message" in parsed.error &&
      typeof parsed.error.message === "string"
    ) {
      detail = parsed.error.message;
    }
  } catch {
    // Ignore malformed vendor errors.
  }
  if (status === 401)
    return detail
      ? `API Key OpenAI tidak valid: ${detail}`
      : "API Key OpenAI tidak valid.";
  if (status === 429) return "Server AI sedang sibuk. Coba lagi.";
  if (status === 403)
    return detail ? `OpenAI menolak akses: ${detail}` : "OpenAI menolak akses.";
  return detail || `Gagal menghubungi server AI (Error ${status}).`;
}

export async function generateOpenAIContent(options: {
  model?: string;
  systemInstruction?: string;
  contents: Content[];
  temperature?: number;
  responseMimeType?: string;
  responseSchema?: unknown;
  usageContext?: UsageContext;
  userId?: string;
  sanitizeOutput?: boolean;
}): Promise<OpenAIResponse> {
  const requestId = `openai-${randomUUID()}`;
  const apiKey = process.env.OPENAI_API_KEY;
  const { modelId, timeoutMs } = resolveModelProvider(
    options.model ?? "gpt-5.4-mini",
  );
  const logTerminal = async (
    status: "success" | "failed" | "timeout",
    tokens: ResponsesUsage = {},
    errorMessage?: string,
  ) => {
    if (!options.usageContext || !options.userId) return;
    const inputTokens = tokenCount(tokens.input_tokens);
    const outputTokens = tokenCount(tokens.output_tokens);
    const totalTokens = tokenCount(tokens.total_tokens) || inputTokens + outputTokens;
    await logAiUsage({
      requestId,
      userId: options.userId,
      provider: "openai",
      modelId,
      usageContext: options.usageContext,
      tokens: status === "success"
        ? { inputTokens, outputTokens, totalTokens }
        : { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      status,
      errorMessage,
    });
  };

  if (!apiKey) {
    await logTerminal("failed", {}, "OPENAI_API_KEY belum dikonfigurasi.");
    return { success: false, error: "OPENAI_API_KEY belum dikonfigurasi." };
  }

  const input: InputMessage[] = [];
  for (const content of options.contents) {
    const role = content.role === "model" || content.role === "assistant"
      ? "assistant"
      : content.role === "user"
        ? "user"
        : undefined;
    if (!role) {
      const error = "Format pesan AI tidak didukung.";
      await logTerminal("failed", {}, error);
      return { success: false, error };
    }
    input.push({ role, content: content.parts.map((part) => part.text).join(" ") });
  }
  const body: Record<string, unknown> = {
    model: modelId,
    instructions: options.systemInstruction,
    input,
    store: false,
  };
  if (supportsTemperature(modelId)) {
    body.temperature = options.temperature ?? 0.7;
  }
  if (options.responseMimeType === "application/json") {
    body.text = options.responseSchema
      ? {
          format: {
            type: "json_schema",
            name: "response",
            strict: true,
            schema: options.responseSchema,
          },
        }
      : { format: { type: "json_object" } };
  }

  try {
    let response: Response | undefined;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs ?? 120_000);
      try {
        response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } finally {
        clearTimeout(timer);
      }
      if (
        response.ok ||
        (response.status !== 429 && response.status < 500) ||
        attempt === 4
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }

    if (!response?.ok) {
      const error = errorMessage(
        response?.status ?? 500,
        response ? await response.text() : "",
      );
      await logTerminal("failed", {}, error);
      return { success: false, error };
    }

    const data = (await response.json()) as ResponsesData;
    if (data.status === "incomplete") {
      const error = "Respons AI tidak lengkap. Coba lagi.";
      await logTerminal("failed", data.usage, error);
      return { success: false, error };
    }
    if (hasRefusal(data)) {
      const error = "AI menolak memproses permintaan tersebut.";
      await logTerminal("failed", data.usage, error);
      return { success: false, error };
    }

    const rawText = extractText(data).trim();
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
    console.error("[OpenAI] Error:", error);
    const timeout = isAbortError(error);
    const message = timeout
      ? "Permintaan AI timeout. Coba lagi."
      : "Terjadi kesalahan koneksi ke server AI.";
    await logTerminal(timeout ? "timeout" : "failed", {}, message);
    return { success: false, error: message };
  }
}
