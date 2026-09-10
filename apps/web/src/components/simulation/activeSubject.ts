import type { SimulationSubjectSelection } from "@trainers/types";

// Kept as a compatibility helper for callers that have not migrated to
// component-owned state. Values are account-keyed; there is deliberately no
// process-wide active subject.
const activeByAccount = new Map<string, SimulationSubjectSelection>();

function normalizeAccountKey(value: string | null): string | null {
  return value && value.trim() ? value : null;
}

export function getActiveSimulationSubject(
  accountKey: string | null,
): SimulationSubjectSelection {
  const key = normalizeAccountKey(accountKey);
  const value = key ? activeByAccount.get(key) : undefined;
  return value ? { ...value } : { type: "self" };
}

export function setActiveSimulationSubject(
  accountKey: string,
  selection: SimulationSubjectSelection,
): void {
  const key = normalizeAccountKey(accountKey);
  if (!key) return;
  activeByAccount.set(key, { ...selection });
}

export function resetActiveSimulationSubject(accountKey: string | null): void {
  const key = normalizeAccountKey(accountKey);
  if (key) activeByAccount.delete(key);
}
