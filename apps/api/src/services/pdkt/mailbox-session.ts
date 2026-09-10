import { randomUUID } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  EmailMessage,
  PdktIdentity,
  PdktScenario,
  ResolvedConsumerNameMentionPattern,
  WritingStyleMode,
  PdktConsumerType,
  type PdktMailboxBatch,
  type SimulationSubjectSnapshot,
} from "@trainers/types";
import {
  initializeEmailSession,
  resolvePdktGenerationConfig,
} from "../pdkt-service";
import { createMailboxItem } from "./mailbox-service";
import { createPdktMailboxRetryDraft } from "./mailbox-retry";

type MailboxSessionPayload = {
  scenarioId?: string;
  scenarioDraft?: PdktScenario;
  consumerTypeId: string;
  consumerTypeDraft?: PdktConsumerType;
  identity: PdktIdentity;
  enableImageGeneration?: boolean;
  selectedModel?: string;
  resolvedConsumerNameMentionPattern?: ResolvedConsumerNameMentionPattern;
  writingStyleMode?: WritingStyleMode;
  client_request_id?: string;
  simulationSubject?:
    | { type: "self" }
    | { type: "participant"; participantId: string };
  /** Resolved by the authenticated API route; never accepted from browser JSON. */
  simulationSubjectSnapshot?: SimulationSubjectSnapshot;
};

type MailboxSaveFailure = {
  success: false;
  message?: EmailMessage;
  error: string;
  status?: number;
  code?: string;
  retryDraft?: ReturnType<typeof createPdktMailboxRetryDraft>;
};

export async function createMailboxSession(
  supabaseClient: SupabaseClient,
  payload: MailboxSessionPayload,
  userId: string,
): Promise<
  | {
      success: true;
      data: string;
      message: EmailMessage;
      retryDraft?: undefined;
    }
  | MailboxSaveFailure
> {
  let configInfo;
  try {
    configInfo = resolvePdktGenerationConfig(payload);
  } catch (err: unknown) {
    return {
      success: false,
      code: "NOT_FOUND",
      status: 404,
      error:
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Scenario atau consumer type tidak ditemukan.",
    };
  }

  const { scenario, config } = configInfo;
  const sessionResult = await initializeEmailSession(config, undefined, userId);
  if (!sessionResult.success || !sessionResult.message) {
    return {
      success: false,
      code: "AI_ERROR",
      status: 502,
      error: sessionResult.error || "Gagal inisialisasi sesi email.",
    };
  }

  const inboundMessage = sessionResult.message;
  // Give retries a stable idempotency key even for legacy callers that did not
  // send client_request_id. The generated message is the same write attempt.
  const clientRequestId = payload.client_request_id || `pdkt-${randomUUID()}`;
  const batch: PdktMailboxBatch = {
    client_request_id: clientRequestId,
    sender_name: config.identity.name,
    sender_email: config.identity.email,
    subject: inboundMessage.subject,
    snippet: inboundMessage.body.substring(0, 100),
    scenario_snapshot: scenario,
    config_snapshot: config,
    inbound_email: inboundMessage,
    simulationSubject: payload.simulationSubject ?? { type: "self" },
  };

  try {
    const mailboxId = await createMailboxItem(
      supabaseClient,
      {
        ...batch,
        simulationSubjectSnapshot: payload.simulationSubjectSnapshot,
      },
      userId,
    );

    return {
      success: true,
      data: mailboxId,
      message: inboundMessage,
    };
  } catch (error: unknown) {
    // The generated message is intentionally returned with a signed, actor-bound
    // draft. A transient mailbox failure must never force a second AI generation.
    let retryDraft: ReturnType<typeof createPdktMailboxRetryDraft> | undefined;
    if (payload.simulationSubjectSnapshot) {
      retryDraft = createPdktMailboxRetryDraft({
        actorId: userId,
        batch,
        simulationSubjectSnapshot: payload.simulationSubjectSnapshot,
      });
    }

    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 503;
    const code =
      status === 403
        ? "FORBIDDEN"
        : status === 404
          ? "NOT_FOUND"
          : status === 409
            ? "CONFLICT"
            : "MAILBOX_SAVE_FAILED";

    return {
      success: false,
      message: inboundMessage,
      error:
        error instanceof Error && error.message
          ? error.message
          : "Gagal menyimpan email ke mailbox.",
      status,
      code,
      ...(retryDraft ? { retryDraft } : {}),
    };
  }
}
