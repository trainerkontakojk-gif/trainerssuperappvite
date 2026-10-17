import { randomInt, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  coerceKetikPdktModelId,
  KETIK_PROMPT_LIMITS,
  KETIK_SESSION_ERRORS,
  normalizeGeneratedParts,
  resolveKetikSessionIdentity,
  mapSimulationSubjectRowToSnapshot,
  type KetikServerSession,
  type KetikSessionTurnRequest,
  type KetikSessionHistoryItem,
  type SimulationSubjectSnapshot,
} from "@trainers/types";
import type { Actor } from "../../middleware/role";
import { createAdminClient } from "../../lib/supabase";
import { resolveModelProvider } from "../../lib/ai-models";
import { getSettingsSnapshot } from "./settings-history";
import { getKetikAssignment } from "./configuration-assignments";
import { generateConsumerResponse } from "./consumer-response";

const statuses = {
  SESSION_NOT_FOUND: 404,
  SESSION_FAILED: 500,
  SESSION_CONFLICT: 409,
  SESSION_EXPIRED: 410,
  ASSIGNMENT_REQUIRED: 409,
  SESSION_CONFIGURATION_INVALID: 400,
  SESSION_AI_FAILED: 502,
} as const;
export class KetikSessionError extends Error {
  readonly status;
  constructor(readonly code: keyof typeof statuses) {
    super(KETIK_SESSION_ERRORS[code]);
    this.status = statuses[code];
  }
}
type SessionRow = {
  id: string;
  user_id: string;
  state: KetikServerSession["state"];
  version: number;
  started_at: string;
  expires_at: string;
  messages: KetikServerSession["messages"] | null;
  consumer_closed: boolean;
  snapshot: Pick<
    KetikServerSession,
    "config" | "scenario" | "simulationSubject"
  >;
};
type TurnRow = {
  request_id: string;
  expected_version: number;
  agent_text: string;
  status: "processing" | "failed";
  lease_expires_at: string | null;
};
type RpcName =
  | "start_ketik_session"
  | "claim_ketik_session_turn"
  | "publish_ketik_session_turn"
  | "finish_ketik_session";
async function rpc<T>(
  name: RpcName,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await createAdminClient().rpc(name, params);
  if (error) {
    switch (error.code) {
      case "PT404":
        throw new KetikSessionError("SESSION_NOT_FOUND");
      case "PT409":
        throw new KetikSessionError("SESSION_CONFLICT");
      case "PT410":
        throw new KetikSessionError("SESSION_EXPIRED");
      case "PT412":
        throw new KetikSessionError("ASSIGNMENT_REQUIRED");
      default:
        throw error;
    }
  }
  return data as T;
}
async function rowToSession(
  row: SessionRow,
  client = createAdminClient(),
): Promise<KetikServerSession> {
  let messages = row.messages ?? [];
  if (row.state === "ended") {
    const { data, error } = await client
      .from("ketik_history")
      .select("messages")
      .eq("id", row.id)
      .eq("user_id", row.user_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new KetikSessionError("SESSION_NOT_FOUND");
    messages = data.messages;
  }
  const { data: pending, error } = await client
    .from("ketik_session_turns")
    .select("request_id,expected_version,agent_text,status,lease_expires_at")
    .eq("session_id", row.id)
    .neq("status", "completed")
    .maybeSingle();
  if (error) throw error;
  const turn = pending as TurnRow | null;
  return {
    id: row.id,
    state: row.state,
    version: row.version,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    ...row.snapshot,
    messages,
    consumerClosed: row.consumer_closed,
    provenance: "server_v1",
    pendingTurn:
      row.state === "active" && turn
        ? {
            requestId: turn.request_id,
            expectedVersion: turn.expected_version,
            text: turn.agent_text,
            status: turn.status,
            leaseExpiresAt: turn.lease_expires_at,
          }
        : null,
  };
}
export async function getServerKetikSession(
  userId: string,
  id: string,
  client: SupabaseClient = createAdminClient(),
) {
  const { data, error } = await client
    .from("ketik_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new KetikSessionError("SESSION_NOT_FOUND");
  return rowToSession(data as SessionRow, client);
}
export async function startServerKetikSession(
  actor: Actor,
  requestId: string,
  simulationSubject: SimulationSubjectSnapshot,
) {
  const admin = createAdminClient();
  const { data: existing, error } = await admin
    .from("ketik_sessions")
    .select("*")
    .eq("user_id", actor.id)
    .eq("start_request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    const row = existing as SessionRow;
    if (
      row.snapshot.simulationSubject.type !== simulationSubject.type ||
      row.snapshot.simulationSubject.participantId !==
        simulationSubject.participantId
    )
      throw new KetikSessionError("SESSION_CONFLICT");
    return rowToSession(row);
  }
  const source = await getSettingsSnapshot(actor.id);
  const assignment =
    actor.role === "agent" || actor.role === "leader"
      ? (await getKetikAssignment(actor, actor.id)).assignment
      : null;
  if ((actor.role === "agent" || actor.role === "leader") && !assignment)
    throw new KetikSessionError("ASSIGNMENT_REQUIRED");
  const scenarios = source.settings.scenarios.filter((s) => s.isActive);
  const consumers = source.settings.consumerTypes;
  const consumerType =
    source.settings.activeConsumerTypeId === "random"
      ? consumers[randomInt(consumers.length || 1)]
      : consumers.find((c) => c.id === source.settings.activeConsumerTypeId);
  if (!scenarios.length || !consumerType)
    throw new KetikSessionError("SESSION_CONFIGURATION_INVALID");
  const scenario = scenarios[randomInt(scenarios.length)];
  const config = {
    scenarios: [scenario],
    consumerType,
    identity: resolveKetikSessionIdentity(
      source.settings.identitySettings,
      randomInt(1_000_000),
    ),
    selectedModel: coerceKetikPdktModelId(source.settings.selectedModel),
    simulationDuration: Math.round(source.settings.simulationDuration),
    responsePacingMode: source.settings.responsePacingMode,
  };
  const row = await rpc<SessionRow>("start_ketik_session", {
    p_user_id: actor.id,
    p_request_id: requestId,
    p_snapshot: {
      config,
      scenario,
      simulationSubject,
      assignmentVersion: assignment?.version ?? null,
    },
    p_settings_version: source.version,
    p_assignment_version: assignment?.version ?? null,
  });
  return rowToSession(row);
}
export async function sendServerKetikTurn(
  userId: string,
  id: string,
  request: KetikSessionTurnRequest,
) {
  const current = await getServerKetikSession(userId, id);
  const timeoutMs =
    resolveModelProvider(current.config.selectedModel).timeoutMs ?? 120_000;
  const claimed = await rpc<{
    session: SessionRow;
    lease: string;
    replay: boolean;
  }>("claim_ketik_session_turn", {
    p_user_id: userId,
    p_session_id: id,
    p_request_id: request.requestId,
    p_expected_version: request.expectedVersion,
    p_text: request.text,
    p_lease_seconds: Math.min(600, Math.ceil((timeoutMs * 2 + 30_000) / 1000)),
  });
  if (claimed.replay) return rowToSession(claimed.session);
  const s = claimed.session;
  try {
    // The consumer reads the agent's back-to-back messages and answers once,
    // on the last one; earlier ones are stored without an AI call.
    if (request.awaitMore) {
      const stored = await rpc<SessionRow>("publish_ketik_session_turn", {
        p_user_id: userId,
        p_session_id: id,
        p_request_id: request.requestId,
        p_lease: claimed.lease,
        p_messages: [],
        p_closed: false,
      });
      return rowToSession(stored);
    }
    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(s.started_at)) / 1000),
    );
    const result = await generateConsumerResponse(
      s.snapshot.config,
      {
        ...s.snapshot.scenario,
        images: s.snapshot.scenario.images?.map(() => ""),
      },
      s.messages ?? [],
      { module: "ketik", action: "generate_consumer_response" },
      userId,
      {
        elapsedSeconds,
        remainingSeconds: Math.max(
          0,
          (Date.parse(s.expires_at) - Date.now()) / 1000,
        ),
        totalDurationSeconds: s.snapshot.config.simulationDuration * 60,
      },
    );
    if (!result.success || !result.text)
      throw new KetikSessionError("SESSION_AI_FAILED");
    const text = result.text.replace(/\[NO_RESPONSE\]/gi, "").trim();
    const parts = normalizeGeneratedParts(
      text
        .split("[BREAK]")
        .map((p) => p.trim())
        .filter(Boolean),
    );
    if (
      (text && !parts.length) ||
      parts.length > 3 ||
      parts.some((p) => p.text.length > KETIK_PROMPT_LIMITS.chatMessageText)
    )
      throw new KetikSessionError("SESSION_AI_FAILED");
    const messages = parts.map((p) => ({
      ...p,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    }));
    const published = await rpc<SessionRow>("publish_ketik_session_turn", {
      p_user_id: userId,
      p_session_id: id,
      p_request_id: request.requestId,
      p_lease: claimed.lease,
      p_messages: messages,
      p_closed: !text,
    });
    return rowToSession(published);
  } catch (error) {
    const failed = await createAdminClient()
      .from("ketik_session_turns")
      .update({ status: "failed", lease: null, lease_expires_at: null })
      .eq("session_id", id)
      .eq("request_id", request.requestId)
      .eq("lease", claimed.lease)
      .eq("status", "processing");
    if (failed.error) throw failed.error;
    throw error;
  }
}
const optionalScore = (value: unknown) =>
  typeof value === "number" ? value : undefined;
export async function finishServerKetikSession(
  userId: string,
  id: string,
): Promise<KetikSessionHistoryItem | null> {
  const data = await rpc<Record<string, unknown> | null>(
    "finish_ketik_session",
    { p_user_id: userId, p_session_id: id },
  );
  if (!data) return null;
  return {
    id: String(data.id),
    date: String(data.date),
    scenarioTitle: String(data.scenario_title),
    consumerName: String(data.consumer_name),
    consumerPhone: data.consumer_phone as string,
    consumerCity: data.consumer_city as string,
    messages: data.messages as KetikSessionHistoryItem["messages"],
    simulationDuration: data.simulation_duration as number,
    finalScore: optionalScore(data.final_score),
    empathyScore: optionalScore(data.empathy_score),
    probingScore: optionalScore(data.probing_score),
    resolutionScore: optionalScore(data.resolution_score),
    typoScore: optionalScore(data.typo_score),
    complianceScore: optionalScore(data.compliance_score),
    reviewStatus: data.review_status as KetikSessionHistoryItem["reviewStatus"],
    simulationSubject: mapSimulationSubjectRowToSnapshot(data),
  };
}
