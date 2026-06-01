import { z } from "zod";

// ── PDKT Types ────────────────────────────────────────
export type WritingStyleMode = "realistic" | "training";

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

export const pdktSessionConfigSchema = z.object({
  scenarios: z.array(pdktScenarioSchema),
  consumerType: pdktConsumerTypeSchema,
  identity: pdktIdentitySchema,
  enableImageGeneration: z.boolean().default(true),
  selectedModel: z.string().default("gemini-3.1-flash-lite"),
  resolvedConsumerNameMentionPattern: z
    .enum(["upfront", "middle", "late", "none"])
    .default("none"),
  writingStyleMode: z.enum(["realistic", "training"]).default("training"),
});
export type PdktSessionConfig = z.infer<typeof pdktSessionConfigSchema>;

export interface PdktEvaluationResult {
  score: number;
  feedback: string;
  typos: string[];
  clarityIssues: string[];
  contentGaps: string[];
}

export type MailboxStatus = "open" | "replied" | "deleted";

export const emailMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  timestamp: z.string(),
  isAgent: z.boolean(),
  attachments: z.array(z.string()).optional(),
  attachmentSource: z.enum(["manual", "ai", "none"]).optional(),
  attachmentWarning: z.string().optional(),
});
export type EmailMessage = z.infer<typeof emailMessageSchema>;

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
  identity: pdktIdentitySchema,
  enableImageGeneration: z.boolean().default(true),
  selectedModel: z.string().default("gemini-3.1-flash-lite"),
  resolvedConsumerNameMentionPattern: z
    .enum(["upfront", "middle", "late", "none"])
    .default("none"),
  writingStyleMode: z.enum(["realistic", "training"]).default("training"),
});

export const evaluateSchema = z.object({
  config: pdktSessionConfigSchema,
  emails: z.array(emailMessageSchema),
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

export const pdktMailboxReplySchema = z.object({
  mailboxId: z.string().uuid(),
  reply: emailMessageSchema,
  timeTaken: z.number().int().positive(),
});
export type PdktMailboxReply = z.infer<typeof pdktMailboxReplySchema>;
