import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, MoreHorizontal, Search } from "lucide-react";
import { cn } from "cn";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Pagination } from "../../components/ui/Pagination";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Skeleton } from "../../components/ui/skeleton";
import { SIMULATION_SUBJECT_UNAVAILABLE_MARKER } from "../../lib/simulation-subject-display";
import { notify } from "../../lib/toast";
import { useTelefunHistory } from "./hooks/useTelefunHistory";
import { fetchTelefunRecordingUrl } from "./hooks/useTelefunRecordingUrl";
import type { CallRecord } from "./types";
import { downloadTelefunHistory } from "./utils/historyCsv";
import { downloadRecording } from "./utils/recordingDownload";
import {
  formatCallDuration,
  formatTelefunDate,
  formatTelefunScore,
  readTelefunScore,
  telefunAnalysisState,
  telefunParticipant,
  telefunStatusLabel,
  type TelefunAnalysisState,
} from "./utils/reviewDisplay";

const PAGE_SIZE = 20;

type StatusFilter = "all" | "scored" | "running" | "failed" | "missing";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "scored", label: "Sudah dinilai" },
  { value: "running", label: "Sedang dianalisis" },
  { value: "failed", label: "Gagal" },
  { value: "missing", label: "Rekaman tidak tersimpan" },
];

function filterOf(
  state: TelefunAnalysisState,
): Exclude<StatusFilter, "all"> | null {
  switch (state) {
    case "scored":
      return "scored";
    case "pending":
    case "processing":
      return "running";
    case "failed":
      return "failed";
    case "no_recording":
      return "missing";
    default:
      return null;
  }
}

const STATUS_DOT: Record<TelefunAnalysisState, string> = {
  scored: "bg-chart-green",
  pending: "bg-module-telefun",
  processing: "bg-module-telefun",
  failed: "bg-chart-orange",
  incomplete: "bg-muted-foreground",
  no_recording: "bg-destructive",
  not_analyzed: "bg-muted-foreground",
};

type PendingDelete = { kind: "one"; record: CallRecord } | { kind: "all" };

/** Riwayat panggilan Telefun: tabel dengan filter status, cari, CSV, dan hapus. */
export default function TelefunHistory() {
  const { history, state, load, remove, clear } = useTelefunHistory();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  // `pendingDelete` tetap terisi saat dialog menutup supaya teksnya tidak
  // berganti selama animasi tutup; `confirmOpen` yang mengatur tampil/tidak.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const counts = useMemo(() => {
    const next: Record<StatusFilter, number> = {
      all: history.length,
      scored: 0,
      running: 0,
      failed: 0,
      missing: 0,
    };
    for (const record of history) {
      const key = filterOf(telefunAnalysisState(record));
      if (key) next[key] += 1;
    }
    return next;
  }, [history]);

  const summary = useMemo(() => {
    if (history.length === 0) return null;
    const scores = history
      .map(readTelefunScore)
      .filter((score): score is number => score !== null);
    const parts = [`${history.length} panggilan`];
    if (scores.length === 0) {
      parts.push("belum ada yang dinilai");
    } else {
      const average =
        scores.reduce((sum, score) => sum + score, 0) / scores.length;
      parts.push(
        `${scores.length} dinilai`,
        `rata-rata skor ${formatTelefunScore(average)}`,
      );
    }
    return parts.join(" · ");
  }, [history]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      history.filter((record) => {
        if (
          filter !== "all" &&
          filterOf(telefunAnalysisState(record)) !== filter
        ) {
          return false;
        }
        if (!normalizedQuery) return true;
        return [
          record.scenarioTitle,
          record.consumerName,
          telefunParticipant(record).name,
        ].some((text) => text.toLowerCase().includes(normalizedQuery));
      }),
    [history, filter, normalizedQuery],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const resetFilters = () => {
    setFilter("all");
    setQuery("");
    setPage(1);
  };

  const askDelete = (next: PendingDelete) => {
    setPendingDelete(next);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (pendingDelete.kind === "one") {
        await remove(pendingDelete.record.id);
      } else {
        await clear();
        resetFilters();
      }
      setConfirmOpen(false);
    } catch (error) {
      console.error("[Telefun] Failed to delete history:", error);
      notify.error(
        pendingDelete.kind === "one"
          ? "Panggilan belum terhapus. Coba lagi."
          : "Riwayat belum terhapus. Coba lagi.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const visibleFilters = FILTERS.filter(
    ({ value }) => value === "all" || counts[value] > 0,
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-5">
        <Link
          to="/telefun"
          search={{}}
          className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-lg text-[13px] font-medium text-fg2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Telefun
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[62ch] flex-col gap-2">
            <h1 className="font-display text-3xl leading-tight font-extrabold tracking-[-0.03em] text-foreground">
              Riwayat panggilan
            </h1>
            <p className="text-[15px] leading-6 text-fg2">
              Setiap panggilan yang Anda akhiri di Telefun beserta hasil telaah
              suaranya. Buka panggilan untuk mendengar ulang rekamannya.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] gap-2 px-4 text-[13px]"
            disabled={history.length === 0}
            onClick={() => downloadTelefunHistory(history)}
          >
            <Download data-icon="inline-start" />
            Unduh CSV
          </Button>
        </div>
        {summary && (
          <p className="text-[13px] font-medium text-fg2">{summary}</p>
        )}
      </header>

      <section aria-label="Panggilan Telefun" className="flex flex-col gap-4">
        {state === "ready" && history.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="group"
              aria-label="Saring status"
              className="flex flex-wrap gap-1.5"
            >
              {visibleFilters.map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  variant={filter === value ? "secondary" : "ghost"}
                  aria-pressed={filter === value}
                  className="min-h-[44px] px-3 text-[13px] aria-pressed:font-semibold"
                  onClick={() => {
                    setFilter(value);
                    setPage(1);
                  }}
                >
                  {label}
                  <span className="tabular-nums text-muted-foreground">
                    {counts[value]}
                  </span>
                </Button>
              ))}
            </div>
            <label className="relative flex items-center sm:w-72">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
              />
              <input
                type="search"
                aria-label="Cari panggilan"
                placeholder="Cari skenario, konsumen, peserta"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                className="min-h-[44px] w-full rounded-lg border border-border bg-background pr-3 pl-9 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated">
          {state === "loading" ? (
            <div className="flex flex-col gap-3 p-5" aria-busy="true">
              <span className="sr-only">Memuat riwayat…</span>
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-12 w-full" />
              ))}
            </div>
          ) : state === "error" ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[13px] text-foreground"
            >
              Riwayat belum bisa dimuat.
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] px-4 text-[13px]"
                onClick={() => void load()}
              >
                Coba lagi
              </Button>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-start gap-3 px-5 py-8">
              <p className="text-[15px] font-semibold text-foreground">
                Belum ada panggilan
              </p>
              <p className="max-w-[52ch] text-[13px] text-fg2">
                Mulai simulasi di Telefun. Setiap panggilan yang diakhiri
                tercatat di sini bersama hasil telaah suaranya.
              </p>
              <Link
                to="/telefun"
                search={{}}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Mulai simulasi
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[13px] text-foreground">
              Tidak ada panggilan yang cocok.
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] px-4 text-[13px]"
                onClick={resetFilters}
              >
                Reset filter
              </Button>
            </div>
          ) : (
            <table
              aria-label="Daftar panggilan Telefun"
              className="w-full table-fixed border-collapse text-[13px]"
            >
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="border-b border-border px-4 py-3 font-medium sm:px-5">
                    Skenario
                  </th>
                  <th className="hidden w-[18%] border-b border-border px-4 py-3 font-medium sm:table-cell">
                    Peserta
                  </th>
                  <th className="hidden w-[14%] border-b border-border px-4 py-3 font-medium md:table-cell">
                    Tanggal
                  </th>
                  <th className="hidden w-[11%] border-b border-border px-4 py-3 font-medium lg:table-cell">
                    Durasi
                  </th>
                  <th className="hidden w-[20%] border-b border-border px-4 py-3 font-medium md:table-cell">
                    Status
                  </th>
                  <th className="w-20 border-b border-border px-4 py-3 text-right font-medium">
                    Skor
                  </th>
                  <th className="w-[60px] border-b border-border px-2 py-3">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:not(:last-child)>td]:border-b [&>tr>td]:border-border">
                {visible.map((record) => (
                  <HistoryRow
                    key={record.id}
                    record={record}
                    onDelete={() => askDelete({ kind: "one", record })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {state === "ready" && filtered.length > PAGE_SIZE && (
          <Pagination
            page={currentPage}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
          />
        )}
      </section>

      {state === "ready" && history.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-[13px] text-fg2">
          <p>
            Hapus semua panggilan, rekaman, dan hasil telaahnya dari riwayat
            Anda.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="min-h-[44px] px-4 text-[13px]"
            onClick={() => askDelete({ kind: "all" })}
          >
            Hapus semua riwayat
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={
          pendingDelete?.kind === "all"
            ? "Hapus semua riwayat?"
            : "Hapus panggilan ini?"
        }
        description={
          pendingDelete?.kind === "one"
            ? `"${pendingDelete.record.scenarioTitle}" beserta rekaman dan hasil telaahnya akan dihapus permanen.`
            : `${history.length} panggilan beserta rekaman dan hasil telaahnya akan dihapus permanen.`
        }
        confirmLabel={
          pendingDelete?.kind === "all" ? "Hapus semua" : "Hapus panggilan"
        }
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function HistoryRow({
  record,
  onDelete,
}: {
  record: CallRecord;
  onDelete: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const participant = telefunParticipant(record);
  const score = readTelefunScore(record);
  const state = telefunAnalysisState(record);
  const status = telefunStatusLabel(record);
  const date = formatTelefunDate(record.date);
  const participantMissing =
    record.simulationSubject?.type === "participant" &&
    !record.simulationSubject.participantId;
  const hasRecording = Boolean(
    record.url || record.recordingPath || record.agentRecordingPath,
  );

  const download = async () => {
    setDownloading(true);
    try {
      const url =
        record.recordingPath || record.agentRecordingPath
          ? await fetchTelefunRecordingUrl(record.id)
          : record.url || null;
      if (!url) {
        notify.error("Rekaman tidak tersedia untuk diunduh.");
        return;
      }
      await downloadRecording(
        url,
        `Telefun_${record.consumerName || "rekaman"}_${record.id}.webm`,
      );
    } catch {
      notify.error("Rekaman belum bisa diunduh. Coba lagi.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <tr className="align-top hover:bg-muted/60">
      <td className="px-4 py-1.5 sm:px-5">
        <Link
          to="/telefun"
          search={{ sesi: record.id, tahap: "telaah" }}
          className="inline-flex min-h-[44px] max-w-full items-center rounded-sm font-semibold text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="line-clamp-2 break-words">
            {record.scenarioTitle}
          </span>
        </Link>
        <span className="block pb-1.5 text-xs text-muted-foreground">
          {[record.consumerName, record.consumerCity]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {/* Di ponsel kolom lain disembunyikan; isinya pindah ke sini. */}
        <span className="block pb-1.5 text-xs text-muted-foreground sm:hidden">
          {participant.label} · {date} · {formatCallDuration(record.duration)}
        </span>
        <span className="block pb-1.5 text-xs text-fg2 md:hidden">
          {status}
        </span>
      </td>
      <td className="hidden px-4 py-3 text-fg2 sm:table-cell">
        <span className="block truncate">{participant.name}</span>
        {participantMissing && (
          <span className="block text-xs text-muted-foreground">
            {SIMULATION_SUBJECT_UNAVAILABLE_MARKER}
          </span>
        )}
      </td>
      <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground md:table-cell">
        {date}
      </td>
      <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground lg:table-cell">
        {formatCallDuration(record.duration)}
      </td>
      <td className="hidden px-4 py-3 md:table-cell">
        <span className="inline-flex items-start gap-1.5 text-xs text-fg2">
          <span
            aria-hidden="true"
            className={cn(
              "mt-1 size-[7px] shrink-0 rounded-full",
              STATUS_DOT[state],
            )}
          />
          {status}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {score !== null ? (
          <span className="font-mono text-[15px] font-bold tabular-nums text-foreground">
            {formatTelefunScore(score)}
          </span>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-[44px] text-muted-foreground hover:text-foreground"
                aria-label={`Aksi lain untuk ${record.scenarioTitle}`}
              />
            }
          >
            <MoreHorizontal data-icon="inline" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              disabled={!hasRecording || downloading}
              onClick={() => void download()}
              className="min-h-[44px]"
            >
              {downloading ? "Mengunduh…" : "Unduh rekaman"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              variant="destructive"
              className="min-h-[44px]"
            >
              Hapus
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
