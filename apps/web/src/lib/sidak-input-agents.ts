export interface SidakInputAgent {
  id: string;
  nama: string;
  batch_name?: string | null;
  tim?: string | null;
  jabatan?: string | null;
}

/** Terima bentuk `{ agents: [...] }` (direktori) maupun array langsung (legacy). */
export function normalizeAgentsResponse(raw: unknown): SidakInputAgent[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.agents)) return obj.agents as SidakInputAgent[];
  if (Array.isArray(raw)) return raw as SidakInputAgent[];
  return [];
}
