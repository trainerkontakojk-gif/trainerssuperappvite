import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import type { CallRecord } from "../types";
import {
  formatCallDuration,
  formatTelefunDate,
  formatTelefunScore,
  readTelefunScore,
  telefunStatusLabel,
} from "./reviewDisplay";

/** Sel CSV yang aman dari formula spreadsheet (=, +, -, @ di awal). */
function escapeCsv(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Unduh riwayat Telefun sebagai CSV ber-BOM supaya Excel membaca UTF-8. */
export function downloadTelefunHistory(history: readonly CallRecord[]) {
  const headers = [
    "Tanggal",
    "Skenario",
    "Konsumen",
    "Kota",
    "Peserta",
    "Pelaksana",
    "Durasi",
    "Status analisis",
    "Skor (0-10)",
    "Umpan balik",
  ];
  const rows = history.map((record) => {
    const score = readTelefunScore(record);
    return [
      formatTelefunDate(record.date),
      record.scenarioTitle,
      record.consumerName,
      record.consumerCity ?? "",
      formatSimulationSubjectLabel(record.simulationSubject, {
        includeParticipantDetails: true,
      }),
      record.userEmail ?? record.userId ?? "",
      formatCallDuration(record.duration),
      telefunStatusLabel(record),
      score === null ? "" : formatTelefunScore(score),
      (record.feedback ?? "").replace(/\s+/g, " ").trim(),
    ];
  });
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsv(String(cell))).join(","))
    .join("\r\n");

  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `telefun_riwayat_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
