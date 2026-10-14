import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Play, Search, Trash2 } from "lucide-react";
import type { KetikSessionHistoryItem } from "@trainers/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Pagination } from "../../components/ui/Pagination";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { notify } from "../../lib/toast";
import { ketikApi } from "./ketikApi";
import { SessionReplayModal } from "./components/SessionReplayModal";
import {
  formatKetikDate,
  readFinalScore,
  reviewStatusLabel,
  sessionParticipant,
  sortNewestFirst,
} from "./utils/reviewDisplay";
import { downloadKetikHistory } from "./utils/transcript";

const PAGE_SIZE = 20;

type StatusFilter = "all" | "completed" | "running" | "failed" | "not_started";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "completed", label: "Ditelaah" },
  { value: "running", label: "Sedang ditelaah" },
  { value: "failed", label: "Gagal" },
  { value: "not_started", label: "Belum ditelaah" },
];

function statusOf(
  session: KetikSessionHistoryItem,
): Exclude<StatusFilter, "all"> {
  switch (session.reviewStatus) {
    case "completed":
      return "completed";
    case "processing":
      return "running";
    case "failed":
      return "failed";
    default:
      return "not_started";
  }
}

type LoadState = "loading" | "ready" | "error";
type PendingDelete =
  { kind: "one"; session: KetikSessionHistoryItem } | { kind: "all" };

export default function KetikHistory() {
  const [history, setHistory] = useState<KetikSessionHistoryItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [replay, setReplay] = useState<KetikSessionHistoryItem | null>(null);
  // `pendingDelete` dibiarkan terisi saat dialog menutup supaya teksnya tidak
  // berganti selama animasi tutup; `confirmOpen` yang mengatur tampil/tidak.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadHistory = useCallback(async () => {
    setState("loading");
    try {
      setHistory(sortNewestFirst(await ketikApi.getHistory()));
      setState("ready");
    } catch (error) {
      console.error("[Ketik] Failed to load history:", error);
      setState("error");
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const counts = useMemo(() => {
    const next: Record<StatusFilter, number> = {
      all: history.length,
      completed: 0,
      running: 0,
      failed: 0,
      not_started: 0,
    };
    for (const session of history) next[statusOf(session)] += 1;
    return next;
  }, [history]);

  const summary = useMemo(() => {
    if (history.length === 0) return null;
    const scores = history
      .map(readFinalScore)
      .filter((score): score is number => score !== null);
    const parts = [`${history.length} sesi`];
    if (scores.length === 0) {
      parts.push("belum ada yang ditelaah");
    } else {
      const average = Math.round(
        scores.reduce((sum, score) => sum + score, 0) / scores.length,
      );
      parts.push(`${scores.length} ditelaah`, `rata-rata skor ${average}`);
    }
    return parts.join(" · ");
  }, [history]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      history.filter((session) => {
        if (filter !== "all" && statusOf(session) !== filter) return false;
        if (!normalizedQuery) return true;
        return [
          session.scenarioTitle,
          session.consumerName,
          sessionParticipant(session).name,
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
        const { id } = pendingDelete.session;
        await ketikApi.deleteSession(id);
        setHistory((prev) => prev.filter((session) => session.id !== id));
      } else {
        await ketikApi.clearHistory();
        setHistory([]);
        resetFilters();
      }
      setConfirmOpen(false);
    } catch (error) {
      console.error("[Ketik] Failed to delete history:", error);
      notify.error(
        pendingDelete.kind === "one"
          ? "Sesi belum terhapus. Coba lagi."
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
          to="/ketik"
          search={{}}
          className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-lg text-[13px] font-medium text-fg2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          KETIK
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[62ch] flex-col gap-2">
            <h1 className="font-display text-3xl leading-tight font-extrabold tracking-[-0.03em] text-foreground">
              Riwayat latihan
            </h1>
            <p className="text-[15px] leading-6 text-fg2">
              Setiap chat yang Anda akhiri di KETIK beserta hasil telaahnya.
              Buka sesi untuk melihat telaah lengkap.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] gap-2 px-4 text-[13px]"
            disabled={history.length === 0}
            onClick={() => downloadKetikHistory(history)}
          >
            <Download data-icon="inline-start" />
            Unduh CSV
          </Button>
        </div>
        {summary && (
          <p className="text-[13px] font-medium text-fg2">{summary}</p>
        )}
      </header>

      <section aria-label="Sesi KETIK" className="flex flex-col gap-4">
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
                aria-label="Cari sesi"
                placeholder="Cari skenario, peserta, konsumen"
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
                onClick={() => void loadHistory()}
              >
                Coba lagi
              </Button>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-start gap-3 px-5 py-8">
              <p className="text-[15px] font-semibold text-foreground">
                Belum ada sesi latihan
              </p>
              <p className="max-w-[52ch] text-[13px] text-fg2">
                Mulai simulasi di KETIK. Setiap chat yang diakhiri akan tercatat
                di sini bersama hasil telaahnya.
              </p>
              <Link
                to="/ketik"
                search={{}}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Mulai simulasi
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[13px] text-foreground">
              Tidak ada sesi yang cocok.
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
              aria-label="Daftar sesi KETIK"
              className="w-full table-fixed border-collapse text-[13px]"
            >
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="border-b border-border px-4 py-3 font-medium sm:px-5">
                    Skenario
                  </th>
                  <th className="hidden w-[20%] border-b border-border px-4 py-3 font-medium sm:table-cell">
                    Peserta
                  </th>
                  <th className="hidden w-[16%] border-b border-border px-4 py-3 font-medium lg:table-cell">
                    Konsumen
                  </th>
                  <th className="hidden w-[15%] border-b border-border px-4 py-3 font-medium md:table-cell">
                    Tanggal
                  </th>
                  <th className="w-24 border-b border-border px-4 py-3 text-right font-medium sm:w-32">
                    Skor
                  </th>
                  <th className="w-[100px] border-b border-border px-2 py-3">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:not(:last-child)>td]:border-b [&>tr>td]:border-border">
                {visible.map((session) => (
                  <HistoryRow
                    key={session.id}
                    session={session}
                    onReplay={() => setReplay(session)}
                    onDelete={() => askDelete({ kind: "one", session })}
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
          <p>Hapus semua sesi dan hasil telaahnya dari riwayat Anda.</p>
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

      <SessionReplayModal
        isOpen={replay !== null}
        onClose={() => setReplay(null)}
        messages={replay?.messages ?? []}
        scenarioTitle={replay?.scenarioTitle}
        consumerName={replay?.consumerName}
      />
      <ConfirmDialog
        open={confirmOpen}
        title={
          pendingDelete?.kind === "all"
            ? "Hapus semua riwayat?"
            : "Hapus sesi ini?"
        }
        description={
          pendingDelete?.kind === "one"
            ? `"${pendingDelete.session.scenarioTitle}" dan hasil telaahnya akan dihapus permanen.`
            : `${history.length} sesi dan hasil telaahnya akan dihapus permanen.`
        }
        confirmLabel={
          pendingDelete?.kind === "all" ? "Hapus semua" : "Hapus sesi"
        }
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function HistoryRow({
  session,
  onReplay,
  onDelete,
}: {
  session: KetikSessionHistoryItem;
  onReplay: () => void;
  onDelete: () => void;
}) {
  const participant = sessionParticipant(session);
  const score = readFinalScore(session);
  const status = statusOf(session);
  const date = formatKetikDate(session.date);

  return (
    <tr className="align-top hover:bg-muted/60">
      <td className="px-4 py-1.5 sm:px-5">
        <Link
          to="/ketik"
          search={{ sesi: session.id, tahap: "telaah" }}
          className="inline-flex min-h-[44px] max-w-full items-center rounded-sm font-semibold text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="line-clamp-2 break-words">
            {session.scenarioTitle}
          </span>
        </Link>
        {/* Di ponsel kolom Peserta & Tanggal disembunyikan; isinya pindah ke sini. */}
        <span className="mt-0.5 block pb-1.5 text-xs text-muted-foreground sm:hidden">
          {participant.name}
          {participant.removed && " (data peserta sudah dihapus)"} · {date}
        </span>
      </td>
      <td className="hidden px-4 py-3 text-fg2 sm:table-cell">
        <span className="block truncate">{participant.name}</span>
        {participant.removed && (
          <span className="block text-xs text-muted-foreground">
            data peserta sudah dihapus
          </span>
        )}
      </td>
      <td className="hidden px-4 py-3 text-fg2 lg:table-cell">
        <span className="block truncate">{session.consumerName}</span>
      </td>
      <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground md:table-cell">
        {date}
      </td>
      <td className="px-4 py-3 text-right">
        {score !== null ? (
          <span className="font-mono text-[15px] font-bold tabular-nums text-foreground">
            {score}
          </span>
        ) : (
          <span
            className={
              status === "failed"
                ? "text-xs font-medium text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {reviewStatusLabel(session.reviewStatus)}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-[44px] text-muted-foreground hover:text-foreground"
          aria-label={`Putar ulang ${session.scenarioTitle}`}
          disabled={session.messages.length === 0}
          onClick={onReplay}
        >
          <Play data-icon="inline" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-[44px] text-muted-foreground hover:text-destructive"
          aria-label={`Hapus sesi ${session.scenarioTitle}`}
          onClick={onDelete}
        >
          <Trash2 data-icon="inline" />
        </Button>
      </td>
    </tr>
  );
}
