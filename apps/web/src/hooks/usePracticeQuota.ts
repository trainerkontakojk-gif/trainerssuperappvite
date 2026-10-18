import type { PracticeModule, PracticeQuotaStatus } from "@trainers/types";
import { useApi } from "./useApi";

/**
 * Today's practice limit for one module (GET /me/practice-quota). The server
 * is the authority; this only explains a refusal before the person clicks.
 */
export function usePracticeQuota(module: PracticeModule) {
  const { data, refetch } = useApi<PracticeQuotaStatus[]>("/me/practice-quota");
  const status = data?.find((entry) => entry.module === module) ?? null;
  const blocked =
    status !== null && status.limit !== null && status.used >= status.limit;
  return { status, blocked, refetch };
}
