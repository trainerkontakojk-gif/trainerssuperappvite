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

type TelefunSessionSubject =
  | { type: "self"; displayName?: string | null }
  | {
      type: "participant";
      participantId: string;
      displayName?: string | null;
      batchName?: string | null;
      team?: string | null;
    };

type TelefunActorProfile = {
  id: string;
  role: string | null;
  full_name: string | null;
  status: string | null;
  is_deleted: boolean | null;
};

function isInactiveProfile(profile: TelefunActorProfile): boolean {
  const status = (profile.status ?? "").trim().toLowerCase();
  return (
    profile.is_deleted === true || !["active", "approved"].includes(status)
  );
}

/**
 * Creates a session for the legacy WebSocket-only path or a subject-aware
 * session when called by a trusted backend flow. The normal web flow resolves
 * the selection through /telefun/sessions before authenticating the socket.
 */
export async function createSession(
  userId: string,
  subject?: TelefunSessionSubject,
): Promise<string> {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, full_name, status, is_deleted")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || isInactiveProfile(profile)) {
    console.error(
      "[Telefun DB] Failed to validate session actor:",
      profileError,
    );
    throw new Error("Akun Telefun tidak aktif atau tidak ditemukan.");
  }

  let simulationSubject: {
    type: "self" | "participant";
    participantId: string | null;
    displayName: string | null;
    batchName: string | null;
    team: string | null;
  } = {
    type: "self",
    participantId: null,
    displayName: profile.full_name?.trim() || "Diri sendiri",
    batchName: null,
    team: null,
  };

  if (subject?.type === "participant") {
    if (
      !["admin", "trainer"].includes((profile.role ?? "").trim().toLowerCase())
    ) {
      throw new Error("Hanya admin/trainer yang dapat memilih peserta.");
    }

    const { data: participant, error: participantError } = await admin
      .from("profiler_peserta")
      .select("id, nama, batch_name, tim")
      .eq("id", subject.participantId)
      .maybeSingle();

    if (participantError || !participant) {
      throw new Error("Peserta tidak ditemukan.");
    }
    if (!participant.nama?.trim()) {
      throw new Error("Data peserta tidak valid.");
    }

    simulationSubject = {
      type: "participant",
      participantId: participant.id,
      displayName: participant.nama.trim(),
      batchName: participant.batch_name ?? null,
      team: participant.tim ?? null,
    };
  }

  const { data, error } = await admin
    .from("telefun_history")
    .insert({
      user_id: userId,
      scenario_title: "Live Simulation",
      consumer_name: "Consumer",
      status: "active",
      messages: [],
      simulation_subject_type: simulationSubject.type,
      simulation_subject_peserta_id: simulationSubject.participantId,
      simulation_subject_name: simulationSubject.displayName,
      simulation_subject_batch_name: simulationSubject.batchName,
      simulation_subject_team: simulationSubject.team,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[Telefun DB] Failed to create session:", error);
    throw new Error("Gagal membuat session Telefun.");
  }
  return data.id;
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

export async function getOwnedSessionId(
  sessionId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("telefun_history")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Gagal memeriksa session: ${error.message}`);
  return data?.id ?? null;
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
