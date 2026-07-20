import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import type { TelefunTranscriptEntry } from "@trainers/types";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export async function createSession(userId: string): Promise<string> {
  const { data, error } = await admin
    .from("telefun_history")
    .insert({
      user_id: userId,
      scenario_title: "Live Simulation",
      consumer_name: "Consumer",
      status: "active",
      messages: [],
    })
    .select("id")
    .single();

  if (error) {
    console.error("[Telefun DB] Failed to create session:", error);
    throw new Error(`Gagal membuat session: ${error.message}`);
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
