import { z } from "zod";

// ── Simulation Subject Attribution ───────────────────────
// Memisahkan akun pelaksana (user_id) dari orang yang dilatih.
// Request memakai satu properti `simulationSubject`; browser tidak
// mengirim snapshot. Snapshot authoritative di-resolve backend.

export type SimulationSubjectSelection =
  | { type: "self" }
  | { type: "participant"; participantId: string };

export type SimulationSubjectSnapshot = {
  type: "self" | "participant" | "unknown";
  participantId: string | null;
  displayName: string | null;
  batchName: string | null;
  team: string | null;
};

export const simulationSubjectSelectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("self") }).strict(),
  z
    .object({
      type: z.literal("participant"),
      participantId: z.string().uuid(),
    })
    .strict(),
]);

export type SimulationSubjectSelectionInput = z.infer<
  typeof simulationSubjectSelectionSchema
>;

export const simulationSubjectSnapshotSchema = z
  .object({
    type: z.enum(["self", "participant", "unknown"]),
    participantId: z.string().uuid().nullable(),
    displayName: z.string().nullable(),
    batchName: z.string().nullable(),
    team: z.string().nullable(),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    if (
      snapshot.type === "participant" &&
      (!snapshot.displayName || snapshot.displayName.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["displayName"],
        message: "Participant snapshots require a display name",
      });
    }
    if (
      snapshot.type === "self" &&
      (snapshot.participantId !== null ||
        snapshot.batchName !== null ||
        snapshot.team !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participantId"],
        message: "Self snapshots cannot include participant fields",
      });
    }
    if (
      snapshot.type === "unknown" &&
      (snapshot.participantId !== null ||
        snapshot.displayName !== null ||
        snapshot.batchName !== null ||
        snapshot.team !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["type"],
        message: "Unknown snapshots cannot include attribution fields",
      });
    }
  });

export type SimulationSubjectSnapshotInput = z.infer<
  typeof simulationSubjectSnapshotSchema
>;

/**
 * Normalisasi write ingress: klien lama tanpa `simulationSubject`
 * diperlakukan sebagai self. Jangan dipakai untuk membaca row lama —
 * read null/absent selalu unknown (lihat mapper di bawah).
 * Melempar pada input invalid agar route memetakan ke 400.
 */
export function normalizeSimulationSubjectSelection(
  input: unknown,
): SimulationSubjectSelection {
  if (input === undefined) return { type: "self" };
  const parsed = simulationSubjectSelectionSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("VALIDATION_ERROR");
  }
  return parsed.data;
}

export interface SimulationSubjectRow {
  simulation_subject_type?: string | null;
  simulation_subject_peserta_id?: string | null;
  simulation_subject_name?: string | null;
  simulation_subject_batch_name?: string | null;
  simulation_subject_team?: string | null;
}

function unknownSimulationSubjectSnapshot(): SimulationSubjectSnapshot {
  return {
    type: "unknown",
    participantId: null,
    displayName: null,
    batchName: null,
    team: null,
  };
}

/**
 * Parses a persisted/server-projected snapshot without allowing malformed
 * legacy metadata to become a claimed attribution.
 */
export function parseSimulationSubjectSnapshot(
  value: unknown,
): SimulationSubjectSnapshot {
  const parsed = simulationSubjectSnapshotSchema.safeParse(value);
  if (!parsed.success) return unknownSimulationSubjectSnapshot();

  const snapshot = parsed.data;
  if (
    snapshot.type === "participant" &&
    (!snapshot.displayName || snapshot.displayName.trim().length === 0)
  ) {
    return unknownSimulationSubjectSnapshot();
  }
  if (
    snapshot.type === "self" &&
    (snapshot.participantId !== null ||
      snapshot.batchName !== null ||
      snapshot.team !== null)
  ) {
    return unknownSimulationSubjectSnapshot();
  }
  if (
    snapshot.type === "unknown" &&
    (snapshot.participantId !== null ||
      snapshot.displayName !== null ||
      snapshot.batchName !== null ||
      snapshot.team !== null)
  ) {
    return unknownSimulationSubjectSnapshot();
  }
  return snapshot;
}

/**
 * Shared mapper row database -> response snapshot.
 * Tidak melakukan lookup peserta terbaru; snapshot persisted menang.
 * - type null/absent -> unknown (legacy), tanpa menebak self.
 * - self -> participantId null, batch/team null, nama dari row apa adanya.
 * - participant -> salin apa adanya (ID boleh null setelah FK delete).
 */
export function mapSimulationSubjectRowToSnapshot(
  row: unknown,
): SimulationSubjectSnapshot {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return unknownSimulationSubjectSnapshot();
  }

  const candidate = row as Record<string, unknown>;
  if (candidate.simulation_subject_type == null) {
    return unknownSimulationSubjectSnapshot();
  }

  return parseSimulationSubjectSnapshot({
    type: candidate.simulation_subject_type,
    participantId: candidate.simulation_subject_peserta_id ?? null,
    displayName: candidate.simulation_subject_name ?? null,
    batchName: candidate.simulation_subject_batch_name ?? null,
    team: candidate.simulation_subject_team ?? null,
  });
}
