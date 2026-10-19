import type {
  PdktHistoryConfig,
  PdktMailboxItem,
  SimulationSubjectSnapshot,
} from "@trainers/types";
import {
  SIMULATION_SUBJECT_UNAVAILABLE_MARKER,
  formatSimulationSubjectLabel,
} from "../../../lib/simulation-subject-display";
import { PDKT_NO_SUBJECT } from "./emailDisplay";

export type PdktEvaluationStatus =
  "not_started" | "pending" | "completed" | "processing" | "failed";

export interface SessionHistory {
  id: string;
  timestamp: string | Date;
  user_id?: string | null;
  user_email?: string | null;
  user_role?: string | null;
  config: PdktHistoryConfig | null;
  emails: Array<PdktMailboxItem | { subject?: string | null } | null> | null;
  evaluation: any;
  evaluationStatus: PdktEvaluationStatus;
  evaluationError?: string | null;
  timeTaken?: number | null;
  simulationSubject?: SimulationSubjectSnapshot | null;
  /** `summary`: a `?view=list` row; load `GET /pdkt/history/:id` to show it. */
  detail?: "summary" | "full";
}

/** Baris mentah `GET /pdkt/history` → bentuk yang dipakai UI. */
export function mapHistoryRow(item: any): SessionHistory {
  return {
    id: item.id,
    timestamp: item.timestamp,
    user_id: item.user_id ?? null,
    user_email: item.user_email ?? null,
    user_role: item.user_role ?? null,
    config: item.config,
    emails: item.emails || [],
    evaluation: item.evaluation,
    evaluationStatus:
      item.evaluation_status || (item.evaluation ? "completed" : "processing"),
    evaluationError: item.evaluation_error,
    timeTaken: item.time_taken,
    simulationSubject: item.simulationSubject ?? null,
    detail: item.detail === "summary" ? "summary" : "full",
  };
}

function sessionEmails(session: SessionHistory): Array<{ subject?: unknown }> {
  return Array.isArray(session.emails)
    ? (session.emails.filter(Boolean) as Array<{ subject?: unknown }>)
    : [];
}

export function getSessionSubject(session: SessionHistory): string {
  const subject = sessionEmails(session).at(-1)?.subject;
  return typeof subject === "string" && subject.trim()
    ? subject
    : PDKT_NO_SUBJECT;
}

export function getSessionScenarioTitle(
  session: SessionHistory,
): string | null {
  const scenarios = (session.config as { scenarios?: unknown } | null)
    ?.scenarios;
  const title = Array.isArray(scenarios)
    ? (scenarios[0] as { title?: unknown } | undefined)?.title
    : null;
  return typeof title === "string" && title.trim() ? title : null;
}

export function getSessionScore(session: SessionHistory): number | null {
  return session.evaluationStatus === "completed" &&
    typeof session.evaluation?.score === "number"
    ? session.evaluation.score
    : null;
}

/**
 * Label peserta untuk PDKT. Label bersama (`formatSimulationSubjectLabel`,
 * dipakai KETIK/Telefun) tetap; PDKT hanya mengganti istilahnya.
 */
export function formatPdktSubjectLabel(
  subject: SimulationSubjectSnapshot | null | undefined,
  options: { includeParticipantDetails?: boolean } = {},
): string {
  return formatSimulationSubjectLabel(subject, {
    ...options,
    unknownLabel: "Tidak tercatat",
  }).replace(
    `(${SIMULATION_SUBJECT_UNAVAILABLE_MARKER})`,
    "(data peserta sudah dihapus)",
  );
}

export interface SessionParticipant {
  name: string;
  /** Data peserta sumbernya sudah dihapus; nama berasal dari snapshot sesi. */
  removed: boolean;
}

export function getSessionParticipant(
  session: SessionHistory,
): SessionParticipant {
  const subject = session.simulationSubject;
  if (!subject || subject.type === "unknown") {
    return { name: "Tidak tercatat", removed: false };
  }
  if (subject.type === "self") {
    return { name: "Diri sendiri", removed: false };
  }
  return {
    name: subject.displayName || "Peserta",
    removed: !subject.participantId,
  };
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

/** Unduh riwayat sebagai CSV; kolomnya tetap sama dengan ekspor sebelumnya. */
export function downloadHistoryCsv(history: SessionHistory[]): void {
  if (
    typeof document === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }
  const rows = [
    [
      "Waktu",
      "Subjek email",
      "Target",
      "Batch",
      "Tim",
      "Pelaksana",
      "Role",
      "Status",
      "Skor",
    ],
    ...history.map((session) => {
      const subject = session.simulationSubject;
      return [
        new Date(session.timestamp).toISOString(),
        String(sessionEmails(session).at(-1)?.subject ?? ""),
        formatSimulationSubjectLabel(subject),
        subject?.type === "participant" ? (subject.batchName ?? "") : "",
        subject?.type === "participant" ? (subject.team ?? "") : "",
        session.user_email ?? "",
        session.user_role ?? "",
        session.evaluationStatus,
        session.evaluation?.score ?? "",
      ];
    }),
  ];
  const blob = new Blob(
    ["﻿", rows.map((row) => row.map(csvCell).join(",")).join("\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pdkt-history-${Date.now()}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}
