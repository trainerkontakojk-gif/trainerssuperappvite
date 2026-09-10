import type { SimulationSubjectSnapshot } from "@trainers/types";

export const SIMULATION_SUBJECT_UNAVAILABLE_MARKER =
  "record peserta tidak lagi tersedia";

export interface SimulationSubjectLabelOptions {
  includeParticipantDetails?: boolean;
  unknownLabel?: string;
}

/**
 * Formats the persisted attribution snapshot without looking up mutable
 * participant records. A participant id can be null after the source row is
 * deleted, so the historical display keeps the snapshot name and marks that
 * the current record is unavailable.
 */
export function formatSimulationSubjectLabel(
  subject: SimulationSubjectSnapshot | null | undefined,
  options: SimulationSubjectLabelOptions = {},
): string {
  if (!subject || subject.type === "unknown") {
    return options.unknownLabel ?? "Target tidak tercatat — sesi lama";
  }

  if (subject.type === "self") {
    return subject.displayName && subject.displayName !== "Diri sendiri"
      ? `Diri sendiri (${subject.displayName})`
      : "Diri sendiri";
  }

  const details = options.includeParticipantDetails
    ? [subject.displayName, subject.batchName, subject.team]
        .filter(Boolean)
        .join(" — ")
    : subject.displayName;
  const label = details || "Peserta resmi";
  return subject.participantId
    ? label
    : `${label} (${SIMULATION_SUBJECT_UNAVAILABLE_MARKER})`;
}
