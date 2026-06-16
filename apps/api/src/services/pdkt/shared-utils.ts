import { UsageContext } from "../../lib/ai-usage";
import { resolveModelProvider } from "../../lib/ai-models";
import { generateGeminiContent } from "../../lib/gemini";
import { generateOpenRouterContent } from "../../lib/openrouter";
import { generateDeepSeekContent } from "../../lib/deepseek";

/**
 * Shared AI caller for PDKT services.
 * Handles provider routing (Gemini vs OpenRouter).
 */
export async function callAI(options: {
  model: string;
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  responseMimeType?: string;
  usageContext?: UsageContext;
  userId?: string;
}) {
  const { modelId, provider } = resolveModelProvider(options.model);
  const isOpenRouter = provider === "openrouter";
  const isDeepSeek = provider === "deepseek";

  const payload = {
    model: modelId,
    systemInstruction: options.systemInstruction,
    contents: [{ role: "user" as const, parts: [{ text: options.prompt }] }],
    temperature: options.temperature ?? 0.7,
    responseMimeType: options.responseMimeType,
    usageContext: options.usageContext,
    userId: options.userId,
  };

  return isOpenRouter
    ? await generateOpenRouterContent(payload)
    : isDeepSeek
      ? await generateDeepSeekContent(payload)
    : await generateGeminiContent(payload);
}

/**
 * Detection for transient AI errors that should be retried.
 */
export function isTransientAiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("500") ||
    message.includes("503") ||
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("sedang sibuk") ||
    message.includes("kesalahan koneksi") ||
    message.includes("temporarily unavailable")
  );
}

/**
 * Normalizes email subject by trimming and preventing leaked patterns.
 */
export function normalizeSubject(raw: string | undefined | null): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length > 60) return "";

  const leakyPatterns = [
    /\[.*\]/,
    /\{.*\}/,
    /subject:/i,
    /perihal:/i,
    /penipuan/i,
    /fraud/i,
    /gagal login/i,
    /transaksi tidak dikenal/i,
    /slik/i,
    /terror/i,
    /penagihan/i,
    /pinjol/i,
    /pinjaman online/i,
    /investasi bodong/i,
    /asuransi/i,
    /leasing/i,
    /bank.*blokir/i,
    /rekening.*diblokir/i,
    /dana.*hilang/i,
    /uang.*raib/i,
  ];

  for (const pattern of leakyPatterns) {
    if (pattern.test(trimmed)) return "";
  }
  return trimmed;
}
