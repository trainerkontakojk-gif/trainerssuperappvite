import { PdktScenario, PdktSessionConfig } from "@trainers/types";
import {
  resolveModelProvider,
  supportsImageGeneration,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
} from "../../lib/ai-models";
import { generateGeminiContent } from "../../lib/gemini";
import { generateOpenRouterContent } from "../../lib/openrouter";
import { UsageContext } from "../../lib/ai-usage";
import { Modality } from "@google/genai";

const MAX_ATTACHMENTS = 3;
const MAX_DATA_URI_LENGTH = 650_000;

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
): Promise<{ success: boolean; images: string[]; error?: string }> {
  // If image generation is disabled in config, skip
  if (!config.enableImageGeneration) {
    return { success: true, images: [] };
  }

  const modelId = config.selectedModel || DEFAULT_IMAGE_GENERATION_MODEL_ID;

  // Resolve model and provider
  let { modelId: resolvedModel, provider } = resolveModelProvider(modelId);

  // Fallback if model doesn't support image generation
  if (!supportsImageGeneration(resolvedModel)) {
    const fallback = resolveModelProvider(DEFAULT_IMAGE_GENERATION_MODEL_ID);
    resolvedModel = fallback.modelId;
    provider = fallback.provider;
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
      // Note: In official Gemini API, Imagen models might require specific handling 
      // but generateContent often works if the model supports it.
      const response = await generateGeminiContent({
        model: resolvedModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        usageContext: finalUsageContext,
        userId,
      });

      return {
        success: response.success,
        images: normalizeAttachments(response.images),
        error: response.error,
      };
    } else {
      // OpenRouter uses modalities: ["image"] for image generation models
      const response = await generateOpenRouterContent({
        model: resolvedModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        modalities: ["image"],
        usageContext: finalUsageContext,
        userId,
      });

      return {
        success: response.success,
        images: normalizeAttachments(response.images),
        error: response.error,
      };
    }
  } catch (error: unknown) {
    console.error("[PDKT Image Gen] Error:", error);
    return {
      success: false,
      images: [],
      error:
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Gagal generate gambar.",
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
