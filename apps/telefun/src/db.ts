import { can, normalizeRole } from "@trainers/types";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import type { TelefunTranscriptEntry } from "@trainers/types";
import type {
  WebRtcProfile,
  WebRtcSession,
} from "./realtime-webrtc/broker-auth.js";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export {
  createTelefunWebRtcDb,
  WebRtcDurabilityError,
} from "./realtime-webrtc/durable-db.js";
export type {
  AttemptOutcome,
  AttemptState,
  TelefunWebRtcDb,
  TelefunWebRtcSupabaseClient,
  UsageStatus,
  WebRtcAttemptClaim,
} from "./realtime-webrtc/durable-db.js";

type TelefunActorProfile = {
  id: string;
  role: string | null;
  status: string | null;
  is_deleted: boolean | null;
};

function isInactiveProfile(profile: TelefunActorProfile): boolean {
  const status = (profile.status ?? "").trim().toLowerCase();
  return (
    profile.is_deleted === true || !["active", "approved"].includes(status)
  );
}

export async function updateSession(
  sessionId: string,
  updates: {
    status?: string;
    messages?: TelefunTranscriptEntry[];
    duration_seconds?: number;
  },
): Promise<void> {
  const { error } = await admin
    .from("telefun_history")
    .update(updates)
    .eq("id", sessionId);

  if (error) {
    console.error("[Telefun DB] Failed to update session:", error);
  }
}

type WebRtcSessionUpdates = {
  status: "completed" | "failed";
  messages: TelefunTranscriptEntry[];
  duration_seconds: number;
};

type WebRtcSessionRow = {
  id: string;
  status: string;
};

type WebRtcQueryResult = {
  data: WebRtcSessionRow | null;
  error: { message: string } | null;
};

type WebRtcUpdateClient = {
  from(table: "telefun_history"): {
    update(updates: WebRtcSessionUpdates): {
      eq(
        column: "id",
        value: string,
      ): {
        eq(
          column: "user_id",
          value: string,
        ): {
          eq(
            column: "status",
            value: "active",
          ): {
            select(columns: "id, status"): {
              maybeSingle(): PromiseLike<WebRtcQueryResult>;
            };
          };
        };
      };
    };
    select(columns: "id, status"): {
      eq(
        column: "id",
        value: string,
      ): {
        eq(
          column: "user_id",
          value: string,
        ): {
          maybeSingle(): PromiseLike<WebRtcQueryResult>;
        };
      };
    };
  };
};

export async function updateWebRtcSessionWithClient(
  client: WebRtcUpdateClient,
  sessionId: string,
  userId: string,
  updates: WebRtcSessionUpdates,
): Promise<void> {
  const { data, error } = await client
    .from("telefun_history")
    .update(updates)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "active")
    .select("id, status")
    .maybeSingle();
  if (error) {
    console.error("[Telefun DB] Failed to finalize WebRTC session:", error);
    throw new Error("WebRTC session persistence failed");
  }
  if (data?.id === sessionId) return;

  const current = await client
    .from("telefun_history")
    .select("id, status")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (
    !current.error &&
    current.data?.id === sessionId &&
    (current.data.status === "completed" || current.data.status === "failed")
  ) {
    return;
  }

  console.error(
    "[Telefun DB] Failed to reconcile WebRTC session finalization:",
    current.error,
  );
  throw new Error("WebRTC session persistence failed");
}

export async function updateWebRtcSession(
  sessionId: string,
  userId: string,
  updates: WebRtcSessionUpdates,
): Promise<void> {
  return updateWebRtcSessionWithClient(
    admin as unknown as WebRtcUpdateClient,
    sessionId,
    userId,
    updates,
  );
}

export async function getWebRtcProfile(
  userId: string,
): Promise<WebRtcProfile | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, status, is_deleted")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Gagal memeriksa profile: ${error.message}`);
  return data as WebRtcProfile | null;
}

export async function getWebRtcSession(
  sessionId: string,
  userId: string,
): Promise<WebRtcSession | null> {
  const { data, error } = await admin
    .from("telefun_history")
    .select(
      "id, user_id, status, telefun_model_id, telefun_transport, live_prompt_instructions, consumer_gender",
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Gagal memeriksa session: ${error.message}`);
  return data as WebRtcSession | null;
}

/** How long after the API created it a session may still be started. */
const SESSION_START_WINDOW_MS = 30 * 60 * 1000;

/**
 * Returns the session id only when the caller may start it now: their own,
 * still active and fresh (one API start, one call), by an active account
 * whose role may use Telefun.
 */
export async function getOwnedSessionId(
  sessionId: string,
  userId: string,
): Promise<string | null> {
  const [{ data: session, error }, { data: profile, error: profileError }] =
    await Promise.all([
      admin
        .from("telefun_history")
        .select("id")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .eq("status", "active")
        .gte(
          "created_at",
          new Date(Date.now() - SESSION_START_WINDOW_MS).toISOString(),
        )
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id, role, status, is_deleted")
        .eq("id", userId)
        .maybeSingle(),
    ]);
  if (error) throw new Error(`Gagal memeriksa session: ${error.message}`);
  if (profileError)
    throw new Error(`Gagal memeriksa profile: ${profileError.message}`);
  if (
    !profile ||
    isInactiveProfile(profile) ||
    !can(normalizeRole(profile.role), "telefun.use")
  )
    return null;
  return session?.id ?? null;
}

export interface ClaimedProcessingSession {
  id: string;
  user_id: string;
  scenario_title: string;
  agent_recording_path: string;
  telefun_model_id: string;
  scoring_status: string;
}

/**
 * Fetch the minimal columns needed for OpenAI voice assessment. Must return a
 * row only when the session is owned by `userId`, currently `processing`, and
 * the stored `telefun_model_id` exactly matches the requested evaluator model.
 * Rejects otherwise so the caller never downloads storage for an invalid request.
 */
export async function queryClaimedProcessingSession(
  sessionId: string,
  userId: string,
  modelId: string,
): Promise<ClaimedProcessingSession | null> {
  const { data, error } = await admin
    .from("telefun_history")
    .select(
      "id, user_id, scenario_title, agent_recording_path, telefun_model_id, scoring_status",
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("telefun_model_id", modelId)
    .eq("scoring_status", "processing")
    .maybeSingle();

  if (error) throw new Error(`Gagal memeriksa session: ${error.message}`);
  if (!data) return null;
  return data as ClaimedProcessingSession;
}
