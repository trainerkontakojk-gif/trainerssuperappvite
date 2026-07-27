import { AIProvider, PdktScenario, PdktSessionConfig } from "@trainers/types";
import {
  resolveModelProvider,
  getImageGenerationMode,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
} from "../../lib/ai-models";
import { generateGeminiContent } from "../../lib/gemini";
import { UsageContext } from "../../lib/ai-usage";
import { Modality } from "@google/genai";

const MAX_ATTACHMENTS = 3;
const MAX_DATA_URI_LENGTH = 650_000;

/**
 * Service to generate AI images for PDKT scenarios.
 * This is decoupled from text generation to maintain maintainability.
 */
export type PdktImageGenerationDiagnostics = {
  attemptedModel: string;
  provider: AIProvider;
  imageGenerationMode: "native" | "none";
  reason?: "disabled" | "manual-attachment" | "provider-error" | "empty-output" | "oversized-output";
  error?: string;
};

export interface PdktImageGenerationResult {
  success: boolean;
  images: string[];
  warning?: string;
  diagnostics: PdktImageGenerationDiagnostics;
}

/**
 * Service to generate AI images for PDKT scenarios.
 * This is decoupled from text generation to maintain maintainability.
 */
export async function generatePdktScenarioImages(
  scenario: PdktScenario,
  emailContent: { subject: string; body: string },
  config: PdktSessionConfig,
  usageContext?: UsageContext,
  userId?: string,
): Promise<PdktImageGenerationResult> {
  const modelId = config.selectedModel || DEFAULT_IMAGE_GENERATION_MODEL_ID;
  let { modelId: resolvedModel, provider } = resolveModelProvider(modelId);
  let mode = getImageGenerationMode(resolvedModel);

  // If the model cannot generate images, try using the default fallback model
  if (mode === "none") {
    const fallback = resolveModelProvider(DEFAULT_IMAGE_GENERATION_MODEL_ID);
    resolvedModel = fallback.modelId;
    provider = fallback.provider;
    mode = getImageGenerationMode(resolvedModel);
  }

  // If model mode is still none, abort image generation
  if (mode === "none") {
    return {
      success: false,
      images: [],
      warning: "Model tidak mendukung pembuatan gambar/bukti lampiran.",
        diagnostics: {
          attemptedModel: resolvedModel,
          provider,
          imageGenerationMode: "none",
          reason: "disabled",
        },
    };
  }

  // If image generation is disabled in config, skip
  if (!config.enableImageGeneration) {
    return {
      success: true,
      images: [],
        diagnostics: {
          attemptedModel: resolvedModel,
          provider,
          imageGenerationMode: mode,
          reason: "disabled",
        },
    };
  }

  // If scenario already has manual attachments, skip AI image generation
  if (scenario.attachmentImages && scenario.attachmentImages.length > 0) {
    return {
      success: true,
      images: [],
        diagnostics: {
          attemptedModel: resolvedModel,
          provider,
          imageGenerationMode: mode,
          reason: "manual-attachment",
        },
    };
  }

  const prompt = `Generate a realistic evidence/attachment image for this consumer complaint email. 
  Scenario: ${scenario.title} - ${scenario.description}
  Email Subject: ${emailContent.subject}
  Email Body Preview: ${emailContent.body.substring(0, 300)}...
  
  The image should look like a mobile phone screenshot, a photo of a document, a bank statement, or a chat log relevant to the complaint.
  No text in the image should be clearly readable unless it's a critical detail (like a logo or a date).
  Style: Realistic photo or screenshot. Output only the image.`;

  const finalUsageContext: UsageContext = usageContext || {
    module: "pdkt",
    action: "generate_scenario_images",
  };

  try {
    if (provider === "gemini") {
      const response = await generateGeminiContent({
        model: resolvedModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        usageContext: finalUsageContext,
        userId,
      });

      if (!response.success) {
        return {
          success: false,
          images: [],
          warning: `Gagal membuat bukti gambar (${response.error || "Gemini provider error"}).`,
          diagnostics: {
            attemptedModel: resolvedModel,
            provider: "gemini",
            imageGenerationMode: mode,
            reason: "provider-error",
            error: response.error,
          },
        };
      }

      const normalized = normalizeAttachments(response.images);
      if (normalized.length === 0) {
        return {
          success: false,
          images: [],
          warning: "Model Gemini tidak menghasilkan data gambar valid.",
          diagnostics: {
            attemptedModel: resolvedModel,
            provider: "gemini",
            imageGenerationMode: mode,
            reason: "empty-output",
          },
        };
      }

      return {
        success: true,
        images: normalized,
        diagnostics: {
          attemptedModel: resolvedModel,
          provider: "gemini",
          imageGenerationMode: mode,
        },
      };
    }

    return {
      success: false,
      images: [],
      warning: "Provider tidak mendukung pembuatan gambar.",
      diagnostics: {
        attemptedModel: resolvedModel,
        provider,
        imageGenerationMode: "none",
        reason: "provider-error",
      },
    };
  } catch (error: unknown) {
    const errorStr = error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Gagal generate gambar.";
    console.error("[PDKT Image Gen] Error:", error);
    return {
      success: false,
      images: [],
      warning: `Gagal membuat bukti gambar (${errorStr}).`,
      diagnostics: {
        attemptedModel: resolvedModel,
        provider,
        imageGenerationMode: mode,
        reason: "provider-error",
        error: errorStr,
      },
    };
  }
}

function normalizeAttachments(images?: string[]): string[] {
  if (!images || images.length === 0) return [];

  const result: string[] = [];
  for (const image of images) {
    if (!image || typeof image !== "string") continue;

    const trimmed = image.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("data:") && trimmed.length > MAX_DATA_URI_LENGTH) {
      console.warn(
        "[PDKT Image Gen] Skipping oversized data URI attachment.",
      );
      continue;
    }

    result.push(trimmed);
    if (result.length >= MAX_ATTACHMENTS) break;
  }

  return result;
}
