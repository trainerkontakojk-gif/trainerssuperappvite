import { createHash } from "node:crypto";

export const WEBRTC_METRIC_NAMES = [
  "cost_reconciliation",
  "sideband_disconnect",
  "duplicate_write",
  "missing_usage",
  "orphan",
  "session_cap",
] as const;

export type WebRtcMetricName = (typeof WEBRTC_METRIC_NAMES)[number];

export interface WebRtcMetric {
  name: WebRtcMetricName;
  provider: "openai-webrtc";
  userIdHash?: string;
  sessionId?: string;
  attemptId?: string;
  value?: number;
  metadata: Record<string, string | number | boolean>;
}

export interface WebRtcMetricInput {
  name: WebRtcMetricName;
  provider?: "openai-webrtc";
  userId?: string;
  sessionId?: string;
  attemptId?: string;
  value?: number;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY =
  /(token|secret|key|password|authorization|cookie|sdp|provider.?call|sideband|url)/i;

function safeIdentifier(value: string | undefined): string | undefined {
  if (!value || value.length > 128) return undefined;
  return /^[A-Za-z0-9:_-]+$/.test(value) ? value : undefined;
}

function hashUserId(value: string | undefined): string | undefined {
  const safeValue = safeIdentifier(value);
  return safeValue
    ? createHash("sha256").update(safeValue, "utf8").digest("hex")
    : undefined;
}

function safeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> {
  if (!metadata) return {};
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) continue;
    if (
      typeof value === "string" &&
      value.length <= 128 &&
      !SENSITIVE_KEY.test(value)
    ) {
      result[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = Math.max(
        0,
        Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER),
      );
    } else if (typeof value === "boolean") {
      result[key] = value;
    }
  }
  return result;
}

export function normalizeWebRtcMetric(input: WebRtcMetricInput): WebRtcMetric {
  const value =
    typeof input.value === "number" && Number.isFinite(input.value)
      ? Math.max(0, Math.min(Math.floor(input.value), Number.MAX_SAFE_INTEGER))
      : undefined;
  const userIdHash = hashUserId(input.userId);
  return {
    name: input.name,
    provider: "openai-webrtc",
    ...(userIdHash ? { userIdHash } : {}),
    ...(safeIdentifier(input.sessionId)
      ? { sessionId: safeIdentifier(input.sessionId) }
      : {}),
    ...(safeIdentifier(input.attemptId)
      ? { attemptId: safeIdentifier(input.attemptId) }
      : {}),
    ...(value === undefined ? {} : { value }),
    metadata: safeMetadata(input.metadata),
  };
}

export function createWebRtcMetricRecorder(
  sink: (metric: WebRtcMetric) => void | Promise<void>,
): { record(input: WebRtcMetricInput): void } {
  return {
    record(input) {
      const metric = normalizeWebRtcMetric(input);
      try {
        void Promise.resolve(sink(metric)).catch(() => undefined);
      } catch {
        // Metrics must never alter call lifecycle or expose provider errors.
      }
    },
  };
}

export function redactProviderDiagnostic(_error: unknown): {
  code: "provider_error";
  message: "provider operation failed";
} {
  return { code: "provider_error", message: "provider operation failed" };
}
