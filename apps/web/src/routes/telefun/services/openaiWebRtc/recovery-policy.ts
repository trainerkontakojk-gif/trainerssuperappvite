export type WebRtcRecoveryCause =
  | "network_lost"
  | "tab_crash"
  | "device_unplugged"
  | "wifi_mobile_switch"
  | "provider_error";

export interface WebRtcRecoveryPlan {
  outcome: "network_lost" | "failed";
  requiresNewSessionBoundary: boolean;
  newAttemptId: string;
  newSessionBoundaryId: string;
  discontinuityId: string;
  previousSessionId: string;
  previousAttemptId?: string;
  reason: WebRtcRecoveryCause;
  createdAtMs: number;
}

export function classifyWebRtcRecoveryCause(
  cause: WebRtcRecoveryCause,
): WebRtcRecoveryPlan["outcome"] {
  return cause === "provider_error" ? "failed" : "network_lost";
}

export function buildWebRtcRecoveryPlan(input: {
  sessionId: string;
  previousAttemptId?: string;
  cause: WebRtcRecoveryCause;
  nowMs?: number;
  createId?: () => string;
}): WebRtcRecoveryPlan {
  const createId =
    input.createId ??
    (() => {
      if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
      }
      return `webrtc-boundary-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    });
  const newAttemptId = createId();
  const discontinuityId = createId();
  return {
    outcome: classifyWebRtcRecoveryCause(input.cause),
    requiresNewSessionBoundary: input.cause !== "provider_error",
    newAttemptId,
    newSessionBoundaryId: discontinuityId,
    discontinuityId,
    previousSessionId: input.sessionId,
    ...(input.previousAttemptId
      ? { previousAttemptId: input.previousAttemptId }
      : {}),
    reason: input.cause,
    createdAtMs: Math.max(0, Math.floor(input.nowMs ?? Date.now())),
  };
}
