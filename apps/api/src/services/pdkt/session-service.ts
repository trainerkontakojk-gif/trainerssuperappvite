import {
  PdktScenario,
  PdktConsumerType,
  PdktIdentity,
  EmailMessage,
  PdktSessionConfig,
  type PdktAttachmentDiagnostics,
  WritingStyleMode,
  ResolvedConsumerNameMentionPattern,
  pdktInitialEmailAiOutputSchema,
  pdktTemplateAiOutputSchema,
} from "@trainers/types";
import { UsageContext } from "../../lib/ai-usage";
import { parseJsonFromModelText } from "../../lib/ai-json";
import { DEFAULT_AI_MODEL_ID } from "../../lib/ai-models";
import { resolvePdktTemplateBody } from "../pdkt-template-resolver";
import { generatePdktScenarioImages } from "./image-generation";
import {
  buildPdktEmailGenerationPolicy,
  buildPdktGenerationMessages,
  renderPdktIdentityByMentionPattern,
  validatePdktEmailPolicyCompliance,
  buildPdktRetryHint,
  getRealisticWritingInstruction as policyGetRealisticWritingInstruction,
  getConsumerNameMentionInstruction as policyGetConsumerNameMentionInstruction,
  getCompanyNameInstruction as policyGetCompanyNameInstruction,
} from "../pdkt-email-policy";
import { callAI, normalizeSubject } from "./shared-utils";
import { getScenarios, getConsumerTypes } from "./catalog-service";
import {
  resolvePdktRecipientTargets,
  resolvePdktRecipientContext,
} from "./recipient-targets";

function getContentStats(body: string) {
  return {
    wordCount: body.split(/\s+/).filter(Boolean).length,
    paragraphCount: body
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean).length,
  };
}

function getLengthViolations(
  body: string,
  policy: ReturnType<typeof buildPdktEmailGenerationPolicy>,
): string[] {
  const { wordCount, paragraphCount } = getContentStats(body);
  const { minWords, maxWords, minParagraphs, maxParagraphs } =
    policy.contentLength;
  const violations: string[] = [];
  if (wordCount < minWords || wordCount > maxWords) {
    violations.push(
      `Panjang isi harus ${minWords}-${maxWords} kata (aktual ${wordCount}).`,
    );
  }
  if (paragraphCount < minParagraphs || paragraphCount > maxParagraphs) {
    violations.push(
      `Jumlah paragraf harus ${minParagraphs}-${maxParagraphs} (aktual ${paragraphCount}).`,
    );
  }
  return violations;
}

function parseTemplateAiOutput(value: unknown) {
  const parsed = pdktTemplateAiOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("format output AI untuk template tidak valid.");
  }
  return parsed.data;
}

function parseInitialEmailAiOutput(value: unknown) {
  const parsed = pdktInitialEmailAiOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("format output AI untuk email awal tidak valid.");
  }
  return parsed.data;
}

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

  const model = config.selectedModel || DEFAULT_AI_MODEL_ID;
  const policy = buildPdktEmailGenerationPolicy(config, scenario, "template");

  const executeGeneration = async (revisionRequirements: string[] = []) => {
    const { systemInstruction, prompt } = buildPdktGenerationMessages(
      policy,
      false,
      revisionRequirements,
    );
    const response = await callAI({
      model,
      prompt,
      systemInstruction,
      responseMimeType: "application/json",
      usageContext,
      userId,
    });

    if (!response.success) throw new Error(response.error || "Gagal generate template.");
    const responseText = response.text || "{}";
    const jsonResponse = parseTemplateAiOutput(
      parseJsonFromModelText(responseText),
    );

    const resolved = resolvePdktTemplateBody({
      subject: jsonResponse.subject || "",
      body: jsonResponse.body,
      scenario,
      identity: config.identity,
      mentionPattern: config.resolvedConsumerNameMentionPattern,
    });

    const subject = normalizeSubject(resolved.subject) || resolved.subject;
    const body = resolved.body;
    const violations = validatePdktEmailPolicyCompliance({ subject, body }, policy);
    const lengthViolations = getLengthViolations(body, policy);

    return {
      subject,
      body,
      leftoverPlaceholders: resolved.leftoverPlaceholders,
      violations,
      lengthViolations,
    };
  };

  try {
    let result = await executeGeneration();

    if (
      result.leftoverPlaceholders.length > 0 ||
      result.lengthViolations.length > 0 ||
      result.violations.length > 0
    ) {
      const placeholderHint =
        result.leftoverPlaceholders.length > 0
          ? `Template sebelumnya masih mengandung placeholder ${result.leftoverPlaceholders.join(", ")}. Ganti semuanya dengan teks konkret tanpa tanda kurung siku atau kurung kurawal.`
          : "";
      const violationHint =
        result.violations.length > 0
          ? buildPdktRetryHint(result.violations, policy)
          : "";

      try {
        result = await executeGeneration(
          [
            placeholderHint,
            ...result.lengthViolations,
            violationHint,
          ].filter(Boolean),
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

    if (result.lengthViolations.length > 0) {
      return {
        success: false,
        error: "Hasil template terlalu pendek/panjang atau jumlah paragraf belum sesuai. Silakan klik Generate ulang untuk mencoba lagi.",
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
  const recipientTargets = resolvePdktRecipientTargets({
    primaryRecipientType: scenario.primaryRecipientType,
    recipientMode: scenario.recipientMode,
    recipientEmails: scenario.recipientEmails,
  });
  const recipientContext =
    config.recipientContext ||
    resolvePdktRecipientContext({
      recipients: recipientTargets.recipients,
      primaryRecipientType: scenario.primaryRecipientType,
    });
  const configWithRecipientContext: PdktSessionConfig = {
    ...config,
    recipientContext,
  };

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
        to: recipientTargets.to,
        subject: rendered.subject,
        body: rendered.body,
        timestamp: new Date().toISOString(),
        isAgent: false,
        recipientContext,
        attachments,
        attachmentSource: attachments.length > 0 ? "manual" : "none",
      },
    };
  }

  // AI Generation Flow
  const customAttachments: string[] = scenario.attachmentImages || [];
  const hasCustomImages = customAttachments.length > 0;
  const model = config.selectedModel || DEFAULT_AI_MODEL_ID;
  const policy = buildPdktEmailGenerationPolicy(
    configWithRecipientContext,
    scenario,
    "initial_email",
  );
  const executeSessionGeneration = async (revisionRequirements: string[] = []) => {
    const { systemInstruction, prompt } = buildPdktGenerationMessages(
      policy,
      hasCustomImages,
      revisionRequirements,
    );
    const response = await callAI({
      model,
      prompt,
      systemInstruction,
      responseMimeType: "application/json",
      usageContext: { module: "pdkt", action: "init_email" },
      userId,
    });

    if (!response.success) {
      throw new Error(response.error || "Layanan AI tidak tersedia.");
    }

    const responseText = response.text || "{}";
    const jsonResponse = parseInitialEmailAiOutput(
      parseJsonFromModelText(responseText),
    );

    const { subject, body } = renderPdktIdentityByMentionPattern(
      jsonResponse.body,
      jsonResponse.subject,
      policy,
    );

    const normalizedSubject = normalizeSubject(subject) || subject;
    const violations = validatePdktEmailPolicyCompliance({ subject: normalizedSubject, body }, policy);
    const lengthViolations = getLengthViolations(body, policy);

    return {
      subject: normalizedSubject,
      body,
      violations,
      lengthViolations,
    };
  };

  try {
    let result = await executeSessionGeneration();

    if (
      result.violations.length > 0 ||
      result.lengthViolations.length > 0
    ) {
      const violationHint =
        result.violations.length > 0 ? buildPdktRetryHint(result.violations, policy) : "";
      try {
        result = await executeSessionGeneration(
          [violationHint, ...result.lengthViolations].filter(Boolean),
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

    if (result.lengthViolations.length > 0) {
      return {
        success: false,
        error: "Email awal terlalu pendek/panjang atau jumlah paragraf belum sesuai. Silakan coba lagi.",
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
        to: recipientTargets.to,
        subject: result.subject,
        body: result.body,
        timestamp: new Date().toISOString(),
        isAgent: false,
        recipientContext,
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
  consumerTypeDraft?: PdktConsumerType;
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
  const scenario =
    body.scenarioDraft ?? scenarios.find((s) => s.id === body.scenarioId);
  const consumerType = body.consumerTypeDraft
    ? body.consumerTypeDraft
    : consumerTypes.find((ct) => ct.id === body.consumerTypeId);

  if (!scenario || !consumerType) {
    throw new Error("Scenario atau consumer type tidak ditemukan.");
  }

  const config: PdktSessionConfig = {
    scenarios: [scenario],
    consumerType,
    identity: body.identity,
    recipientContext: resolvePdktRecipientContext({
      recipients: resolvePdktRecipientTargets({
        primaryRecipientType: scenario.primaryRecipientType,
        recipientMode: scenario.recipientMode,
        recipientEmails: scenario.recipientEmails,
      }).recipients,
      primaryRecipientType: scenario.primaryRecipientType,
    }),
    enableImageGeneration: body.enableImageGeneration ?? true,
    selectedModel: body.selectedModel || DEFAULT_AI_MODEL_ID,
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
  return buildPdktGenerationMessages(policy, hasCustomImages).systemInstruction;
}
