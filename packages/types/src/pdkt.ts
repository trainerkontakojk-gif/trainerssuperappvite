import { z } from "zod";
import { DEFAULT_AI_MODEL_ID } from "./ai-models";

// ── PDKT Types ────────────────────────────────────────
export const PDKT_PROMPT_INPUT_LIMITS = {
  id: 200,
  timestamp: 100,
  shortText: 500,
  longText: 50_000,
  emailAddress: 320,
  modelId: 300,
  recipientCount: 50,
  issueCount: 100,
  issueText: 2_000,
  feedback: 20_000,
  imagePromptCount: 3,
  imagePrompt: 2_000,
} as const;

export type WritingStyleMode = "realistic" | "training";

export type PdktPrimaryRecipientType = "ojk" | "reported_company";

export type PdktReplyIntent =
  | "reply_to_company_with_ojk_cc"
  | "reply_to_ojk";

export interface PdktRecipientContext {
  primaryRecipientType: PdktPrimaryRecipientType;
  primaryRecipientAddress: string;
  ccRecipients: string[];
  replyIntent: PdktReplyIntent;
}

export interface PdktEvaluationScoreBreakdown {
  recipientDirectionScore: number;
  normativeResponseScore: number;
  clarityScore: number;
  typoScore: number;
  templateComplianceScore: number;
}

export type ConsumerNameMentionPattern =
  | "random"
  | "upfront"
  | "middle"
  | "late"
  | "none";

export type ResolvedConsumerNameMentionPattern =
  | "upfront"
  | "middle"
  | "late"
  | "none";

export const pdktConsumerTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).optional(),
  tone: z.string().optional(),
  isCustom: z.boolean().optional(),
});
export type PdktConsumerType = z.infer<typeof pdktConsumerTypeSchema>;

export const pdktScenarioSchema = z.object({
  id: z.string(),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  isActive: z.boolean(),
  primaryRecipientType: z.enum(["ojk", "reported_company"]).optional(),
  recipientMode: z.enum(["single", "multiple"]).optional(),
  recipientEmails: z.array(z.string()).optional(),
  script: z.string().optional(),
  sampleEmailTemplate: z
    .object({
      subject: z.string().optional(),
      body: z.string(),
    })
    .optional(),
  alwaysUseSampleEmail: z.boolean().optional(),
  isLicensed: z.boolean().optional(),
  attachmentImages: z.array(z.string()).optional(),
});
export type PdktScenario = z.infer<typeof pdktScenarioSchema>;

export const pdktIdentitySchema = z.object({
  name: z.string(),
  email: z.string(),
  city: z.string(),
  bodyName: z.string(),
});
export type PdktIdentity = z.infer<typeof pdktIdentitySchema>;

const boundedPromptString = (max: number) => z.string().max(max);

export const pdktPromptRecipientContextSchema = z.object({
  primaryRecipientType: z.enum(["ojk", "reported_company"]),
  primaryRecipientAddress: boundedPromptString(
    PDKT_PROMPT_INPUT_LIMITS.emailAddress,
  ),
  ccRecipients: z
    .array(boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.emailAddress))
    .max(PDKT_PROMPT_INPUT_LIMITS.recipientCount),
  replyIntent: z.enum([
    "reply_to_company_with_ojk_cc",
    "reply_to_ojk",
  ]),
});

export const pdktPromptConsumerTypeSchema = pdktConsumerTypeSchema.extend({
  id: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.id),
  name: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.shortText),
  description: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.longText),
  tone: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.shortText).optional(),
});

export const pdktPromptScenarioSchema = pdktScenarioSchema.extend({
  id: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.id),
  category: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.shortText),
  title: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.shortText),
  description: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.longText),
  recipientEmails: z
    .array(boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.emailAddress))
    .max(PDKT_PROMPT_INPUT_LIMITS.recipientCount)
    .optional(),
  script: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.longText).optional(),
  sampleEmailTemplate: z
    .object({
      subject: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.shortText).optional(),
      body: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.longText),
    })
    .optional(),
});

export const pdktPromptIdentitySchema = pdktIdentitySchema.extend({
  name: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.shortText),
  email: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.emailAddress),
  city: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.shortText),
  bodyName: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.shortText),
});

export const pdktSessionConfigSchema = z.object({
  scenarios: z.array(pdktScenarioSchema),
  consumerType: pdktConsumerTypeSchema,
  identity: pdktIdentitySchema,
  recipientContext: z
    .object({
      primaryRecipientType: z.enum(["ojk", "reported_company"]),
      primaryRecipientAddress: z.string(),
      ccRecipients: z.array(z.string()),
      replyIntent: z.enum([
        "reply_to_company_with_ojk_cc",
        "reply_to_ojk",
      ]),
    })
    .optional(),
  enableImageGeneration: z.boolean().default(true),
  selectedModel: z.string().default(DEFAULT_AI_MODEL_ID),
  resolvedConsumerNameMentionPattern: z
    .enum(["upfront", "middle", "late", "none"])
    .default("none"),
  writingStyleMode: z.enum(["realistic", "training"]).default("training"),
});
export type PdktSessionConfig = z.infer<typeof pdktSessionConfigSchema>;

const pdktPromptSessionConfigFields = {
  consumerType: pdktPromptConsumerTypeSchema,
  identity: pdktPromptIdentitySchema,
  recipientContext: pdktPromptRecipientContextSchema.optional(),
  selectedModel: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.modelId).default(
    DEFAULT_AI_MODEL_ID,
  ),
};

export const pdktPromptSessionConfigSchema = pdktSessionConfigSchema.extend({
  ...pdktPromptSessionConfigFields,
  scenarios: z.array(pdktPromptScenarioSchema).length(1),
});

export const pdktMailboxPromptSessionConfigSchema =
  pdktSessionConfigSchema.extend({
    ...pdktPromptSessionConfigFields,
    scenarios: z.array(pdktPromptScenarioSchema).max(1),
  });

const pdktAiScoreSchema = z.number().finite().min(0).max(100);

export const pdktAiScoreBreakdownSchema = z
  .object({
    recipientDirectionScore: pdktAiScoreSchema,
    normativeResponseScore: pdktAiScoreSchema,
    clarityScore: pdktAiScoreSchema,
    typoScore: pdktAiScoreSchema,
    templateComplianceScore: pdktAiScoreSchema,
  })
  .strict();

const pdktEmailAiOutputBaseSchema = z
  .object({
    subject: z.string().max(PDKT_PROMPT_INPUT_LIMITS.shortText),
    body: z.string().min(1).max(PDKT_PROMPT_INPUT_LIMITS.longText),
  })
  .strict();

export const pdktGeneratedEmailAiOutputSchema = pdktEmailAiOutputBaseSchema
  .extend({
    imagePrompts: z
      .array(
        z.string().min(1).max(PDKT_PROMPT_INPUT_LIMITS.imagePrompt),
      )
      .max(PDKT_PROMPT_INPUT_LIMITS.imagePromptCount)
      .optional(),
  })
  .strict();

export const pdktTemplateAiOutputSchema = pdktEmailAiOutputBaseSchema;
export const pdktInitialEmailAiOutputSchema = pdktGeneratedEmailAiOutputSchema;

export const pdktEvaluationAiOutputSchema = z
  .object({
    score: pdktAiScoreSchema,
    scoreBreakdown: pdktAiScoreBreakdownSchema,
    typos: z
      .array(z.string().max(PDKT_PROMPT_INPUT_LIMITS.issueText))
      .max(PDKT_PROMPT_INPUT_LIMITS.issueCount),
    clarityIssues: z
      .array(z.string().max(PDKT_PROMPT_INPUT_LIMITS.issueText))
      .max(PDKT_PROMPT_INPUT_LIMITS.issueCount),
    contentGaps: z
      .array(z.string().max(PDKT_PROMPT_INPUT_LIMITS.issueText))
      .max(PDKT_PROMPT_INPUT_LIMITS.issueCount),
    feedback: z.string().max(PDKT_PROMPT_INPUT_LIMITS.feedback),
  })
  .strict();

export interface PdktEvaluationResult {
  score: number;
  feedback: string;
  typos: string[];
  clarityIssues: string[];
  contentGaps: string[];
  scoreBreakdown?: PdktEvaluationScoreBreakdown;
}

export type MailboxStatus = "open" | "replied" | "deleted";

export const pdktAttachmentDiagnosticsSchema = z.object({
  source: z.enum(["manual", "ai", "none"]),
  status: z.enum(["attached", "skipped", "failed"]),
  reason: z
    .enum([
      "manual-attachment",
      "disabled",
      "provider-error",
      "empty-output",
      "oversized-output",
      "unsupported-model",
    ])
    .optional(),
  attemptedModel: z.string().optional(),
  provider: z.enum(["gemini", "openrouter", "deepseek"]).optional(),
  message: z.string().optional(),
});
export type PdktAttachmentDiagnostics = z.infer<
  typeof pdktAttachmentDiagnosticsSchema
>;

export const emailMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  timestamp: z.string(),
  isAgent: z.boolean(),
  recipientContext: z
    .object({
      primaryRecipientType: z.enum(["ojk", "reported_company"]),
      primaryRecipientAddress: z.string(),
      ccRecipients: z.array(z.string()),
      replyIntent: z.enum([
        "reply_to_company_with_ojk_cc",
        "reply_to_ojk",
      ]),
    })
    .optional(),
  attachments: z.array(z.string()).optional(),
  attachmentSource: z.enum(["manual", "ai", "none"]).optional(),
  attachmentWarning: z.string().optional(),
  attachmentDiagnostics: pdktAttachmentDiagnosticsSchema.optional(),
});
export type EmailMessage = z.infer<typeof emailMessageSchema>;

export const pdktPromptEmailMessageSchema = emailMessageSchema.extend({
  id: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.id),
  from: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.emailAddress),
  to: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.emailAddress),
  subject: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.shortText),
  body: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.longText),
  timestamp: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.timestamp),
  recipientContext: pdktPromptRecipientContextSchema.optional(),
});

export interface PdktMailboxItem {
  id: string;
  user_id: string;
  status: MailboxStatus;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  replied_at?: string | null;
  sender_name: string;
  sender_email: string;
  subject: string;
  snippet: string;
  scenario_snapshot: PdktScenario;
  config_snapshot: PdktSessionConfig;
  inbound_email: EmailMessage;
  emails_thread: EmailMessage[];
  history_id?: string | null;
  last_activity_at: string;
  time_taken?: number | null;
  created_by_user_id?: string;
  client_request_id?: string;
  share_batch_id?: string;
  is_shared_copy?: boolean;
  shared_at?: string | null;
  source_mailbox_item_id?: string | null;
  created_by_user?: PdktMailboxCreator | null;
  permissions?: PdktMailboxPermissions;
}

export interface PdktMailboxCreator {
  id: string | null;
  full_name: string;
  role: string | null;
  is_current_user: boolean;
}

export interface PdktMailboxPermissions {
  can_delete: boolean;
}

export interface PdktSessionHistory {
  id: string;
  timestamp: string;
  config: PdktSessionConfig;
  emails: EmailMessage[];
  evaluation: PdktEvaluationResult | null;
  evaluationStatus: "pending" | "processing" | "completed" | "failed";
  evaluationError?: string | null;
  evaluationStartedAt?: string | null;
  evaluationCompletedAt?: string | null;
  timeTaken: number | null;
}

export const generateEmailSchema = z.object({
  scenarioId: z.string().optional(),
  scenarioDraft: pdktScenarioSchema.optional(),
  consumerTypeId: z.string(),
  consumerTypeDraft: pdktConsumerTypeSchema.optional(),
  identity: pdktIdentitySchema,
  enableImageGeneration: z.boolean().default(true),
  selectedModel: z.string().default(DEFAULT_AI_MODEL_ID),
  resolvedConsumerNameMentionPattern: z
    .enum(["upfront", "middle", "late", "none"])
    .default("none"),
  writingStyleMode: z.enum(["realistic", "training"]).default("training"),
});

export const evaluateSchema = z.object({
  config: pdktSessionConfigSchema,
  emails: z.array(emailMessageSchema),
});

export const generateEmailPromptSchema = generateEmailSchema.extend({
  scenarioId: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.id).optional(),
  scenarioDraft: pdktPromptScenarioSchema.optional(),
  consumerTypeId: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.id),
  consumerTypeDraft: pdktPromptConsumerTypeSchema.optional(),
  identity: pdktPromptIdentitySchema,
  selectedModel: boundedPromptString(PDKT_PROMPT_INPUT_LIMITS.modelId).default(
    DEFAULT_AI_MODEL_ID,
  ),
});

export const evaluatePromptSchema = evaluateSchema.extend({
  config: pdktPromptSessionConfigSchema,
  emails: z.array(pdktPromptEmailMessageSchema).length(2),
});

export const pdktMailboxBatchSchema = z.object({
  client_request_id: z.string().optional(),
  sender_name: z.string(),
  sender_email: z.string(),
  subject: z.string(),
  snippet: z.string(),
  scenario_snapshot: pdktScenarioSchema,
  config_snapshot: pdktSessionConfigSchema,
  inbound_email: emailMessageSchema,
});
export type PdktMailboxBatch = z.infer<typeof pdktMailboxBatchSchema>;

export const pdktMailboxBatchPromptSchema = pdktMailboxBatchSchema.extend({
  scenario_snapshot: pdktPromptScenarioSchema,
  config_snapshot: pdktMailboxPromptSessionConfigSchema,
  inbound_email: pdktPromptEmailMessageSchema,
});

export const pdktMailboxReplySchema = z.object({
  mailboxId: z.string().uuid(),
  reply: emailMessageSchema,
  timeTaken: z.number().int().positive(),
});
export type PdktMailboxReply = z.infer<typeof pdktMailboxReplySchema>;

export const pdktMailboxReplyPromptSchema = pdktMailboxReplySchema.extend({
  reply: pdktPromptEmailMessageSchema,
});

export const pdktMailboxBulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()),
});
export type PdktMailboxBulkDelete = z.infer<typeof pdktMailboxBulkDeleteSchema>;
