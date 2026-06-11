export class PermanentScoringError extends Error {
  readonly code: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "PermanentScoringError";
    this.code = code || "PERMANENT_ERROR";
  }
}

export class TransientScoringError extends Error {
  readonly code: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "TransientScoringError";
    this.code = code || "TRANSIENT_ERROR";
  }
}

export function classifyScoringError(error: unknown): "transient" | "permanent" {
  if (error instanceof PermanentScoringError) return "permanent";
  if (error instanceof TransientScoringError) return "transient";

  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  const permanentPatterns = [
    "not found",
    "no agent audio",
    "unauthorized",
    "invalid assessment",
    "format hasil analisis",
    "bad request",
    "permanent",
    "invalid shape",
  ];

  for (const pat of permanentPatterns) {
    if (lower.includes(pat)) return "permanent";
  }

  const transientPatterns = [
    "timeout",
    "timed out",
    "econnrefused",
    "econnreset",
    "rate limit",
    "too many requests",
    "429",
    "download",
    "transient",
    "database unavailable",
    "failed to download",
    "eai_again",
    "etimedout",
    "eaddrinfo",
    "socket",
    "network",
    "5",
    "internal server error",
    "service unavailable",
  ];

  for (const pat of transientPatterns) {
    if (lower.includes(pat)) return "transient";
  }

  // Treat 4xx errors (except 429) as permanent
  if (lower.includes("4") && !lower.includes("429")) {
    const fourxxMatch = msg.match(/\b(4\d{2})\b/);
    if (fourxxMatch && fourxxMatch[1] !== "429") return "permanent";
  }

  // Default: treat unknown as permanent to avoid infinite retry loops
  return "permanent";
}

export const MAX_SCORING_ATTEMPTS = 3;

const BACKOFF_MS = [30_000, 120_000, 300_000];

export function calculateBackoffMs(attemptCount: number): number {
  if (attemptCount <= 0) return BACKOFF_MS[0];
  const idx = Math.min(attemptCount - 1, BACKOFF_MS.length - 1);
  return BACKOFF_MS[idx];
}

export function calculateNextAttemptAt(attemptCount: number): Date {
  const backoffMs = calculateBackoffMs(attemptCount);
  return new Date(Date.now() + backoffMs);
}

export function formatNextAttemptAt(date: Date): string {
  return date.toISOString();
}
