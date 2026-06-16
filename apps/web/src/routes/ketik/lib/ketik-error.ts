import { ApiError } from "../../../lib/api";

export function shouldLogKetikGenerationError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;

  if (error.code === "AI_ERROR") return false;

  return true;
}
