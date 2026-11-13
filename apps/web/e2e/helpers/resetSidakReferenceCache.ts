/** Test-only: SQL fixtures bypass API write invalidation. Import only after pinning API env. */
export async function resetSidakReferenceCache() {
  const { invalidatePeriods, invalidateIndicators } =
    await import("../../../api/src/services/sidak/period-indicator");
  const { invalidatePublishedRuleVersions } =
    await import("../../../api/src/services/sidak/rule-version-resolver");
  const { invalidateRuleIndicatorSnapshots, invalidateServiceWeights } =
    await import("../../../api/src/services/sidak/period-scoring-context");
  const { invalidateAgentDirectorySummary } =
    await import("../../../api/src/services/sidak/agent-directory");
  invalidateAgentDirectorySummary();
  invalidatePeriods();
  invalidateIndicators();
  invalidatePublishedRuleVersions();
  invalidateRuleIndicatorSnapshots();
  invalidateServiceWeights();
}
