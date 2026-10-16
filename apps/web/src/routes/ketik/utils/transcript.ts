import type {
  KetikHistorySummaryItem,
  KetikSessionHistoryItem,
} from "@trainers/types";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import { readFinalScore, reviewStatusLabel } from "./reviewDisplay";

/** Sel CSV aman dari formula injection (`=`, `+`, `-`, `@` di awal). */
function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function download(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

const SENDER_LABELS = {
  agent: "Agen",
  consumer: "Konsumen",
  system: "Sistem",
} as const;

/** Unduh transkrip satu sesi sebagai CSV. */
export function downloadKetikTranscript(
  session: KetikSessionHistoryItem,
): void {
  const subject = session.simulationSubject;
  const participant = subject?.type === "participant" ? subject : null;
  const header = [
    "Pengirim",
    "Pesan",
    "Waktu",
    "Peserta",
    "Batch",
    "Tim",
    "Record Peserta",
  ];
  const rows = session.messages.map((message) => [
    SENDER_LABELS[message.sender],
    message.text,
    new Date(message.timestamp).toLocaleString("id-ID"),
    formatSimulationSubjectLabel(subject),
    participant?.batchName ?? "",
    participant?.team ?? "",
    participant && !participant.participantId
      ? "Tidak lagi tersedia"
      : "Tersedia",
  ]);
  download(`ketik_transkrip_${session.id}.csv`, toCsv([header, ...rows]));
}

/** Unduh daftar riwayat sebagai CSV, satu baris per sesi. */
export function downloadKetikHistory(
  history: readonly KetikHistorySummaryItem[],
): void {
  const header = [
    "Tanggal",
    "Skenario",
    "Peserta",
    "Konsumen",
    "Kota",
    "Status",
    "Skor akhir",
    "Empati & Komunikasi",
    "Probing",
    "Resolusi",
    "Tata Tulis",
    "Kepatuhan",
  ];
  const rows = history.map((session) => [
    new Date(session.date).toLocaleString("id-ID"),
    session.scenarioTitle,
    formatSimulationSubjectLabel(session.simulationSubject, {
      includeParticipantDetails: true,
    }),
    session.consumerName,
    session.consumerCity ?? "",
    reviewStatusLabel(session.reviewStatus),
    readFinalScore(session) ?? "",
    session.empathyScore ?? "",
    session.probingScore ?? "",
    session.resolutionScore ?? "",
    session.typoScore ?? "",
    session.complianceScore ?? "",
  ]);
  download(`ketik_riwayat_${Date.now()}.csv`, toCsv([header, ...rows]));
}
