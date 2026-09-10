import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, History, RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  mapSimulationSubjectRowToSnapshot,
  type PdktSessionHistory,
} from "@trainers/types";
import { pdktClient, unwrapResponse } from "../../lib/api";
import { formatSimulationSubjectLabel } from "../../lib/simulation-subject-display";

function statusLabel(status: PdktSessionHistory["evaluationStatus"]): string {
  switch (status) {
    case "completed":
      return "Selesai";
    case "processing":
    case "pending":
      return "Memproses";
    case "failed":
      return "Gagal";
    default:
      return "Belum dinilai";
  }
}

function statusClass(status: PdktSessionHistory["evaluationStatus"]): string {
  switch (status) {
    case "completed":
      return "border-[var(--chart-green)]/30 text-[var(--chart-green)]";
    case "processing":
    case "pending":
      return "border-[var(--chart-amber)]/30 text-[var(--chart-amber)]";
    case "failed":
      return "border-[var(--destructive)]/30 text-[var(--destructive)]";
    default:
      return "border-[var(--border)] text-[var(--fg2)]";
  }
}

function mapHistoryRow(row: unknown): PdktSessionHistory {
  const raw =
    row && typeof row === "object" && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : {};
  const evaluation = (raw.evaluation ??
    null) as PdktSessionHistory["evaluation"];
  const rawStatus = raw.evaluationStatus ?? raw.evaluation_status;
  const evaluationStatus =
    rawStatus === "not_started" ||
    rawStatus === "pending" ||
    rawStatus === "processing" ||
    rawStatus === "completed" ||
    rawStatus === "failed"
      ? rawStatus
      : evaluation
        ? "completed"
        : "processing";

  return {
    id: typeof raw.id === "string" ? raw.id : "unknown-session",
    timestamp:
      typeof raw.timestamp === "string"
        ? raw.timestamp
        : typeof raw.created_at === "string"
          ? raw.created_at
          : "",
    user_id: typeof raw.user_id === "string" ? raw.user_id : null,
    user_email: typeof raw.user_email === "string" ? raw.user_email : null,
    user_role: typeof raw.user_role === "string" ? raw.user_role : null,
    config: raw.config as PdktSessionHistory["config"],
    emails: Array.isArray(raw.emails)
      ? (raw.emails as PdktSessionHistory["emails"])
      : [],
    evaluation,
    evaluationStatus,
    evaluationError:
      typeof raw.evaluationError === "string"
        ? raw.evaluationError
        : typeof raw.evaluation_error === "string"
          ? raw.evaluation_error
          : null,
    timeTaken:
      typeof raw.timeTaken === "number"
        ? raw.timeTaken
        : typeof raw.time_taken === "number"
          ? raw.time_taken
          : null,
    simulationSubject:
      raw.simulationSubject !== undefined
        ? (raw.simulationSubject as PdktSessionHistory["simulationSubject"])
        : mapSimulationSubjectRowToSnapshot(raw),
  };
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function exportHistory(history: PdktSessionHistory[]): void {
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
      "Skenario",
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
        session.timestamp,
        session.emails[session.emails.length - 1]?.subject ?? "",
        session.config.scenarios[0]?.title ?? "",
        formatSimulationSubjectLabel(subject, {
          unknownLabel: "Peserta tidak tercatat — sesi lama",
        }),
        subject?.type === "participant" ? (subject.batchName ?? "") : "",
        subject?.type === "participant" ? (subject.team ?? "") : "",
        session.user_email ?? "",
        session.user_role ?? "",
        statusLabel(session.evaluationStatus),
        session.evaluation?.score ?? "",
      ];
    }),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pdkt-history-${Date.now()}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

export default function PdktHistory() {
  const [history, setHistory] = useState<PdktSessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await unwrapResponse(
        await pdktClient.history.$get(),
      )) as unknown;
      setHistory(Array.isArray(data) ? data.map(mapHistoryRow) : []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Gagal memuat riwayat PDKT.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link
            to="/pdkt"
            className="mt-0.5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--fg2)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
            aria-label="Kembali ke PDKT"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--fg2)]">
              PDKT
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--fg)]">
              Riwayat sesi
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--fg2)]">
              Lihat target simulasi, pelaksana, status evaluasi, dan konteks
              batch dari snapshot yang tersimpan.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportHistory(history)}
            disabled={history.length === 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] px-3.5 text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--inv-bg)] px-3.5 text-sm font-medium text-[var(--inv-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
            Muat ulang
          </button>
        </div>
      </header>

      {error && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-[var(--destructive)]/40 bg-[var(--surface)] p-5 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-sm text-[var(--fg)]">{error}</p>
          <button
            type="button"
            onClick={() => void loadHistory()}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] px-3 text-sm font-medium text-[var(--fg)] hover:bg-[var(--bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
          >
            Coba lagi
          </button>
        </section>
      )}

      <section
        className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
        aria-label="Daftar riwayat PDKT"
        aria-busy={loading}
      >
        {loading ? (
          <div
            className="space-y-3 p-6"
            aria-live="polite"
            aria-label="Memuat riwayat"
          >
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="h-14 animate-pulse rounded-lg bg-[var(--bg)] motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
            <History className="h-8 w-8 text-[var(--fg3)]" />
            <h2 className="text-base font-semibold text-[var(--fg)]">
              Belum ada sesi PDKT
            </h2>
            <p className="max-w-sm text-sm text-[var(--fg2)]">
              Sesi yang Anda selesaikan akan muncul di sini.
            </p>
            <Link
              to="/pdkt"
              className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-[var(--inv-bg)] px-4 text-sm font-medium text-[var(--inv-fg)] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
            >
              Mulai simulasi
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-xs font-semibold text-[var(--fg2)]">
                <tr>
                  <th className="px-5 py-3">Sesi</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Batch / tim</th>
                  <th className="px-4 py-3">Pelaksana</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Skor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {history.map((session) => {
                  const scenario =
                    session.config.scenarios[0]?.title || "Simulasi email";
                  const emailSubject =
                    session.emails[session.emails.length - 1]?.subject ||
                    "Tanpa subjek";
                  const subject = session.simulationSubject;
                  return (
                    <tr
                      key={session.id}
                      className="even:bg-[var(--bg)]/40 hover:bg-[var(--bg)]"
                    >
                      <td className="max-w-[270px] px-5 py-4">
                        <div
                          className="truncate font-medium text-[var(--fg)]"
                          title={emailSubject}
                        >
                          {emailSubject}
                        </div>
                        <div className="mt-1 truncate text-xs text-[var(--fg2)]">
                          {scenario} ·{" "}
                          {new Date(session.timestamp).toLocaleString("id-ID")}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="font-medium text-[var(--fg)]">
                          {formatSimulationSubjectLabel(subject, {
                            unknownLabel: "Peserta tidak tercatat — sesi lama",
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-[var(--fg2)]">
                        <div>
                          {subject?.type === "participant"
                            ? subject.batchName || "—"
                            : "—"}
                        </div>
                        <div className="mt-1 text-xs">
                          {subject?.type === "participant"
                            ? subject.team || "Tim belum tercatat"
                            : "—"}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="font-medium text-[var(--fg)]">
                          {session.user_email || "Anda"}
                        </div>
                        <div className="mt-1 text-xs text-[var(--fg2)]">
                          {session.user_role || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span
                          className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${statusClass(session.evaluationStatus)}`}
                        >
                          {statusLabel(session.evaluationStatus)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right align-top font-semibold tabular-nums text-[var(--fg)]">
                        {session.evaluation?.score ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
