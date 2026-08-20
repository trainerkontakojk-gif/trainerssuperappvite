import {
  POC_TRANSPORT,
  isHistoricalTelefunOpenAiWebRtcModelId,
} from "./contracts.js";

export interface WebRtcProfile {
  id?: string;
  role?: string | null;
  status?: string | null;
  is_deleted?: boolean | null;
}

export interface WebRtcSession {
  id: string;
  user_id: string;
  status: string;
  telefun_model_id?: string | null;
  telefun_transport?: string | null;
  live_prompt_instructions?: string | null;
  consumer_gender?: string | null;
}

export interface BrokerAuthDependencies {
  /** Deprecated admission input retained only for call-site compatibility. */
  rollout?: unknown;
  verifyToken: (
    token: string,
    signal?: AbortSignal,
  ) => Promise<{
    success: boolean;
    user?: { id: string } | null;
  }>;
  getProfile: (
    userId: string,
    signal?: AbortSignal,
  ) => Promise<WebRtcProfile | null>;
  getSession: (
    sessionId: string,
    userId: string,
    signal?: AbortSignal,
  ) => Promise<WebRtcSession | null>;
}

export type BrokerAuthResult =
  | { ok: true; userId: string; sessionId: string; session: WebRtcSession }
  | {
      ok: false;
      reason: "unauthorized" | "forbidden" | "not_found" | "aborted";
    };

/**
 * Authorizes only cleanup of an already-owned historical WebRTC session.
 * Retired rollout values are intentionally absent from every decision.
 */
export async function authorizeWebRtcCall(
  input: {
    token: string;
    sessionId: string;
    operation?: "start" | "end";
    signal?: AbortSignal;
  },
  dependencies: BrokerAuthDependencies,
): Promise<BrokerAuthResult> {
  let verified: Awaited<ReturnType<BrokerAuthDependencies["verifyToken"]>>;
  try {
    verified = await raceWithAbort(
      dependencies.verifyToken(input.token, input.signal),
      input.signal,
    );
  } catch {
    return {
      ok: false,
      reason: input.signal?.aborted ? "aborted" : "unauthorized",
    };
  }
  if (input.signal?.aborted) return { ok: false, reason: "aborted" };
  const userId = verified.success ? verified.user?.id : undefined;
  if (!userId) return { ok: false, reason: "unauthorized" };

  // There is no longer a start authorization path. Keeping this explicit
  // prevents a future caller from turning compatibility auth into admission.
  if (input.operation === "start") return { ok: false, reason: "not_found" };

  let profile: WebRtcProfile | null;
  try {
    profile = await raceWithAbort(
      dependencies.getProfile(userId, input.signal),
      input.signal,
    );
  } catch {
    return {
      ok: false,
      reason: input.signal?.aborted ? "aborted" : "forbidden",
    };
  }
  if (input.signal?.aborted) return { ok: false, reason: "aborted" };
  if (!profile || profile.is_deleted === true) {
    return { ok: false, reason: "forbidden" };
  }
  if (normalizeWebRtcProfileStatus(profile.status) !== "active") {
    return { ok: false, reason: "forbidden" };
  }
  const normalizedRole = normalizeWebRtcProfileRole(profile.role);
  if (normalizedRole !== "admin" && normalizedRole !== "trainer") {
    return { ok: false, reason: "forbidden" };
  }

  let session: WebRtcSession | null;
  try {
    session = await raceWithAbort(
      dependencies.getSession(input.sessionId, userId, input.signal),
      input.signal,
    );
  } catch {
    return {
      ok: false,
      reason: input.signal?.aborted ? "aborted" : "not_found",
    };
  }
  if (input.signal?.aborted) return { ok: false, reason: "aborted" };
  if (
    !session ||
    session.id !== input.sessionId ||
    session.user_id !== userId ||
    !isHistoricalCleanupStatus(session.status) ||
    session.telefun_transport !== POC_TRANSPORT ||
    !isHistoricalTelefunOpenAiWebRtcModelId(session.telefun_model_id)
  ) {
    return { ok: false, reason: "not_found" };
  }

  return { ok: true, userId, sessionId: input.sessionId, session };
}

function isHistoricalCleanupStatus(status: string): boolean {
  return ["pending", "active", "completed", "failed"].includes(status);
}

function normalizeWebRtcProfileStatus(status?: string | null): string {
  const normalized = status?.trim().toLowerCase() ?? "";
  return normalized === "approved" ? "active" : normalized;
}

function normalizeWebRtcProfileRole(role?: string | null): string {
  const normalized = role?.trim().toLowerCase() ?? "";
  return normalized === "trainers" ? "trainer" : normalized;
}

async function raceWithAbort<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) throw new Error("request aborted");
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(new Error("request aborted"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}
