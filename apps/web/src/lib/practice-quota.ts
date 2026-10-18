import type { PracticeQuotaErrorCode } from "@trainers/types";
import { ApiError } from "./api/unwrap-response";

const QUOTA_CODES: readonly PracticeQuotaErrorCode[] = [
  "PRACTICE_LIMIT_REACHED",
  "PRACTICE_NOT_ALLOWED",
];

/** The server's own words when a start was refused by the daily limit. */
export function practiceQuotaMessage(error: unknown): string | null {
  return error instanceof ApiError &&
    (QUOTA_CODES as readonly string[]).includes(error.code)
    ? error.message
    : null;
}
