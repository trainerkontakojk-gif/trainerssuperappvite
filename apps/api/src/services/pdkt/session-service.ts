import {
  PdktScenario,
  PdktConsumerType,
  PdktIdentity,
  EmailMessage,
  PdktSessionConfig,
  type PdktAttachmentDiagnostics,
  WritingStyleMode,
  ResolvedConsumerNameMentionPattern,
} from "@trainers/types";
import { UsageContext } from "../../lib/ai-usage";
import { parseJsonFromModelText } from "../../lib/ai-json";
import { resolvePdktTemplateBody } from "../pdkt-template-resolver";
import { generatePdktScenarioImages } from "./image-generation";
import {
  buildPdktEmailGenerationPolicy,
  buildPdktSystemInstruction,
  renderPdktIdentityByMentionPattern,
  validatePdktEmailPolicyCompliance,
  buildPdktRetryHint,
  getRealisticWritingInstruction as policyGetRealisticWritingInstruction,
  getConsumerNameMentionInstruction as policyGetConsumerNameMentionInstruction,
  getCompanyNameInstruction as policyGetCompanyNameInstruction,
} from "../pdkt-email-policy";
import { callAI, normalizeSubject } from "./shared-utils";
import { getScenarios, getConsumerTypes } from "./catalog-service";

/**
 * Generates an email template for a specific scenario using AI.
 * Validates result against length and compliance policies.
 */
export async function generateScenarioEmailTemplate(
  scenario: PdktScenario,
  config: PdktSessionConfig,
  usageContext?: UsageContext,
  userId?: string,
): Promise<{
  success: boolean;
  subject?: string;
  body?: string;
  error?: string;
}> {
  if (scenario.alwaysUseSampleEmail && scenario.sampleEmailTemplate?.body) {
    const resolved = resolvePdktTemplateBody({
      subject: scenario.sampleEmailTemplate.subject || "",
      body: scenario.sampleEmailTemplate.body,
      scenario,
      identity: config.identity,
      mentionPattern: config.resolvedConsumerNameMentionPattern,
    });

    if (resolved.leftoverPlaceholders.length > 0) {
      return {
        success: false,
        error: `Template masih mengandung placeholder: ${resolved.leftoverPlaceholders.join(", ")}`,
      };
    }

    return {
      success: true,
      subject: resolved.subject,
      body: resolved.body,
    };
  }

  const model = config.selectedModel || "gemini-3.1-flash-lite";
  const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");
  const systemInstruction = buildPdktSystemInstruction(policy, false);
  const prompt = `Tulis template email pengaduan lengkap untuk skenario: ${scenario.title}. Deskripsi: ${scenario.description}. Karakter: ${config.consumerType.name}. PENTING: Template harus sangat panjang (500-1000 kata), terdiri dari 5-8 paragraf terpisah (gunakan \\n\\n antar paragraf). Jangan tulis dalam 1 paragraf saja.`;

  const executeGeneration = async (retryPrompt?: string) => {
    const finalPrompt = retryPrompt ? `${prompt}\n\nREVISI: ${retryPrompt}` : prompt;
    const response = await callAI({
      model,
      prompt: finalPrompt,
      systemInstruction,
      responseMimeType: "application/json",
      usageContext,
      userId,
    });

    if (!response.success) throw new Error(response.error || "Gagal generate template.");
    const responseText = response.text || "{}";
    const jsonResponse = parseJsonFromModelText(responseText);

    const resolved = resolvePdktTemplateBody({
      subject: jsonResponse.subject || "",
      body: jsonResponse.body || "",
      scenario,
      identity: config.identity,
      mentionPattern: config.resolvedConsumerNameMentionPattern,
    });

    const subject = normalizeSubject(resolved.subject) || resolved.subject;
    const body = resolved.body;
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const violations = validatePdktEmailPolicyCompliance({ subject, body }, policy);

    return {
      subject,
      body,
      wordCount,
      leftoverPlaceholders: resolved.leftoverPlaceholders,
      violations,
    };
  };

  try {
    let result = await executeGeneration();

    if (
      result.leftoverPlaceholders.length > 0 ||
      result.wordCount < 500 ||
      result.violations.length > 0
    ) {
      const placeholderHint =
        result.leftoverPlaceholders.length > 0
          ? `Template sebelumnya masih mengandung placeholder ${result.leftoverPlaceholders.join(", ")}. Ganti semuanya dengan teks konkret tanpa tanda kurung siku atau kurung kurawal.`
          : "";
      const lengthHint =
        result.wordCount < 500
          ? "Template sebelumnya terlalu pendek. Buat jauh lebih panjang, detail, dan bertele-tele (target 500-1000 kata, minimal 500 kata, 5-8 paragraf terpisah dengan baris kosong, tanpa bullet points)."
          : "";
      const violationHint =
        result.violations.length > 0
          ? buildPdktRetryHint(result.violations, policy)
          : "";

      try {
        result = await executeGeneration(
          [placeholderHint, lengthHint, violationHint].filter(Boolean).join(" "),
        );
      } catch (err) {
        console.warn("[PDKT] Template retry failed, using first attempt:", err);
      }
    }

    if (result.leftoverPlaceholders.length > 0) {
      return {
        success: false,
        error: `Template masih mengandung placeholder: ${result.leftoverPlaceholders.join(", ")}`,
      };
    }

    if (result.wordCount < 500) {
      return {
        success: false,
        error: "Hasil template terlalu pendek. Silakan klik Generate ulang untuk mencoba lagi.",
      };
    }

    if (result.violations.length > 0) {
      return {
        success: false,
        error: "Hasil template masih melanggar aturan nama atau gaya penulisan. Silakan klik Generate ulang untuk mencoba lagi.",
      };
    }

    return {
      success: true,
      subject: result.subject,
      body: result.body,
    };
  } catch (error: unknown) {
    console.error("[PDKT] Template error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Gagal generate template.",
    };
  }
}

/**
 * Initializes a new email session.
 * Handles forced templates or triggers AI generation for the initial email.
 */
export async function initializeEmailSession(
  config: PdktSessionConfig,
  usageContext?: UsageContext,
  userId?: string,
): Promise<{ success: boolean; message?: EmailMessage; error?: string }> {
  const scenario = config.scenarios[0];
  if (!scenario) return { success: false, error: "Skenario tidak ditemukan." };

  // Handle Forced Template
  if (scenario.alwaysUseSampleEmail && scenario.sampleEmailTemplate?.body) {
    const rendered = resolvePdktTemplateBody({
      subject: scenario.sampleEmailTemplate.subject || "",
      body: scenario.sampleEmailTemplate.body,
      scenario,
      identity: config.identity,
      mentionPattern: config.resolvedConsumerNameMentionPattern,
    });

    if (rendered.leftoverPlaceholders.length > 0) {
      return {
        success: false,
        error: `Template masih mengandung placeholder: ${rendered.leftoverPlaceholders.join(", ")}`,
      };
    }

    const attachments = scenario.attachmentImages || [];
    return {
      success: true,
      message: {
        id: Date.now().toString(),
        from: config.identity.email,
        to: "konsumen@ojk.go.id",
        subject: rendered.subject,
        body: rendered.body,
        timestamp: new Date().toISOString(),
        isAgent: false,
        attachments,
        attachmentSource: attachments.length > 0 ? "manual" : "none",
      },
    };
  }

  // AI Generation Flow
  const customAttachments: string[] = scenario.attachmentImages || [];
  const hasCustomImages = customAttachments.length > 0;
  const model = config.selectedModel || "gemini-3.1-flash-lite";
  const policy = buildPdktEmailGenerationPolicy(config, scenario, "initial_email");
  const systemInstruction = buildPdktSystemInstruction(policy, hasCustomImages);

  const prompt = `Tulis email pengaduan pertama Anda sekarang. Masalah: ${scenario.title}. Karakter: ${config.consumerType.name}. PENTING: Email harus 500-1000 kata, terdiri dari 5-8 paragraf terpisah (gunakan \\n\\n antar paragraf). Jangan tulis dalam 1 paragraf saja.`;

  const executeSessionGeneration = async (retryPrompt?: string) => {
    const finalPrompt = retryPrompt ? `${prompt}\n\nREVISI: ${retryPrompt}` : prompt;
    const response = await callAI({
      model,
      prompt: finalPrompt,
      systemInstruction,
      responseMimeType: "application/json",
      usageContext: { module: "pdkt", action: "init_email" },
      userId,
    });

    if (!response.success) {
      throw new Error(response.error || "Layanan AI tidak tersedia.");
    }

    const responseText = response.text || "{}";
    const jsonResponse = parseJsonFromModelText(responseText);

    const { subject, body } = renderPdktIdentityByMentionPattern(
      jsonResponse.body || "",
      jsonResponse.subject || "",
      policy,
    );

    const normalizedSubject = normalizeSubject(subject) || subject;
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const violations = validatePdktEmailPolicyCompliance({ subject: normalizedSubject, body }, policy);

    return {
      subject: normalizedSubject,
      body,
      wordCount,
      violations,
    };
  };

  try {
    let result = await executeSessionGeneration();

    if (result.violations.length > 0 || result.wordCount < 500) {
      const violationHint =
        result.violations.length > 0 ? buildPdktRetryHint(result.violations, policy) : "";
      const lengthHint =
        result.wordCount < 500
          ? "Email terlalu pendek. Buat jauh lebih panjang (target 500-1000 kata, minimal 500 kata, 5-8 paragraf terpisah dengan baris kosong, tanpa bullet points)."
          : "";

      try {
        result = await executeSessionGeneration(
          [violationHint, lengthHint].filter(Boolean).join(" "),
        );
      } catch (err) {
        console.warn("[PDKT] Session init retry failed, using first attempt:", err);
      }
    }

    if (result.violations.length > 0) {
      return {
        success: false,
        error: "Email awal masih melanggar aturan nama atau gaya penulisan. Silakan coba lagi.",
      };
    }

    // Resolve attachments: Manual has priority over AI
    let attachments = customAttachments;
    let attachmentSource: "manual" | "ai" | "none" = hasCustomImages ? "manual" : "none";
    let attachmentDiagnostics: PdktAttachmentDiagnostics = {
      source: attachmentSource,
      status: hasCustomImages ? "attached" : "skipped",
      reason: hasCustomImages ? "manual-attachment" : undefined,
    };

    if (!hasCustomImages && !config.enableImageGeneration) {
      attachmentDiagnostics = {
        source: "none",
        status: "skipped",
        reason: "disabled",
      };
    } else if (!hasCustomImages && config.enableImageGeneration) {
      try {
        const imageResult = await generatePdktScenarioImages(
          scenario,
          { subject: result.subject, body: result.body },
          config,
          { module: "pdkt", action: "generate_ai_images" },
          userId,
        );

        if (imageResult.success && imageResult.images.length > 0) {
          attachments = imageResult.images;
          attachmentSource = "ai";
          attachmentDiagnostics = {
            source: "ai",
            status: "attached",
            attemptedModel: imageResult.diagnostics?.attemptedModel,
            provider: imageResult.diagnostics?.provider,
          };
        } else {
          attachmentDiagnostics = {
            source: "none",
            status: "failed",
            reason: imageResult.diagnostics?.reason || "empty-output",
            attemptedModel: imageResult.diagnostics?.attemptedModel,
            provider: imageResult.diagnostics?.provider,
            message: imageResult.warning || "Gagal membuat bukti gambar.",
          };
        }
      } catch (imgError) {
        console.warn("[PDKT] AI Image generation failed, continuing with no attachments:", imgError);
        attachmentDiagnostics = {
          source: "none",
          status: "failed",
          reason: "provider-error",
          message: imgError instanceof Error ? imgError.message : String(imgError),
        };
      }
    }

    return {
      success: true,
      message: {
        id: Date.now().toString(),
        from: config.identity.email,
        to: "konsumen@ojk.go.id",
        subject: result.subject,
        body: result.body,
        timestamp: new Date().toISOString(),
        isAgent: false,
        attachments,
        attachmentSource,
        attachmentDiagnostics,
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Gagal memulai sesi email.",
    };
  }
}

/**
 * Resolves scenario and consumer type IDs into a full PdktSessionConfig.
 */
export function resolvePdktGenerationConfig(body: {
  scenarioId?: string;
  scenarioDraft?: PdktScenario;
  consumerTypeId: string;
  identity: PdktIdentity;
  enableImageGeneration?: boolean;
  selectedModel?: string;
  resolvedConsumerNameMentionPattern?: ResolvedConsumerNameMentionPattern;
  writingStyleMode?: WritingStyleMode;
}): {
  scenario: PdktScenario;
  consumerType: PdktConsumerType;
  config: PdktSessionConfig;
} {
  const scenarios = getScenarios();
  const consumerTypes = getConsumerTypes();
  const scenario = body.scenarioId
    ? scenarios.find((s) => s.id === body.scenarioId)
    : body.scenarioDraft;
  const consumerType = consumerTypes.find((ct) => ct.id === body.consumerTypeId);

  if (!scenario || !consumerType) {
    throw new Error("Scenario atau consumer type tidak ditemukan.");
  }

  const config: PdktSessionConfig = {
    scenarios: [scenario],
    consumerType,
    identity: body.identity,
    enableImageGeneration: body.enableImageGeneration ?? true,
    selectedModel: body.selectedModel || "gemini-3.1-flash-lite",
    resolvedConsumerNameMentionPattern: body.resolvedConsumerNameMentionPattern || "none",
    writingStyleMode: body.writingStyleMode || "training",
  };

  return { scenario, consumerType, config };
}

// ── Policy Wrappers ──────────────────────────────────────

export function getRealisticWritingInstruction(mode: WritingStyleMode): string {
  return policyGetRealisticWritingInstruction(mode);
}

export function getConsumerNameMentionInstruction(
  pattern: ResolvedConsumerNameMentionPattern,
): string {
  return policyGetConsumerNameMentionInstruction(pattern);
}

export function getCompanyNameInstruction(scenario?: PdktScenario): string {
  return policyGetCompanyNameInstruction(scenario);
}

export function getSystemInstruction(config: PdktSessionConfig, hasCustomImages: boolean): string {
  const scenario = config.scenarios[0];
  if (!scenario) return "Tidak ada skenario.";
  const policy = buildPdktEmailGenerationPolicy(config, scenario, "initial_email");
  return buildPdktSystemInstruction(policy, hasCustomImages);
}
