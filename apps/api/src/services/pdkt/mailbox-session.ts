import { SupabaseClient } from "@supabase/supabase-js";
import {
  EmailMessage,
  PdktIdentity,
  PdktScenario,
  ResolvedConsumerNameMentionPattern,
  WritingStyleMode,
} from "@trainers/types";
import {
  initializeEmailSession,
  resolvePdktGenerationConfig,
} from "../pdkt-service";
import { createMailboxItem } from "./mailbox-service";

export async function createMailboxSession(
  supabaseClient: SupabaseClient,
  payload: {
    scenarioId?: string;
    scenarioDraft?: PdktScenario;
    consumerTypeId: string;
    identity: PdktIdentity;
    enableImageGeneration?: boolean;
    selectedModel?: string;
    resolvedConsumerNameMentionPattern?: ResolvedConsumerNameMentionPattern;
    writingStyleMode?: WritingStyleMode;
    client_request_id?: string;
  },
  userId: string,
): Promise<{ success: boolean; data?: string; message?: EmailMessage; error?: string }> {
  let configInfo;
  try {
    configInfo = resolvePdktGenerationConfig(payload);
  } catch (err: unknown) {
    return {
      success: false,
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
      error: sessionResult.error || "Gagal inisialisasi sesi email.",
    };
  }

  const inboundMessage = sessionResult.message;
  const mailboxId = await createMailboxItem(supabaseClient, {
    client_request_id: payload.client_request_id,
    sender_name: config.identity.name,
    sender_email: config.identity.email,
    subject: inboundMessage.subject,
    snippet: inboundMessage.body.substring(0, 100),
    scenario_snapshot: scenario,
    config_snapshot: config,
    inbound_email: inboundMessage,
  });

  return {
    success: true,
    data: mailboxId,
    message: inboundMessage,
  };
}
