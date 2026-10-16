import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Play, Search, Trash2 } from "lucide-react";
import type {
  KetikSessionHistoryItem,
  KetikHistorySummaryItem,
} from "@trainers/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useAuthStore } from "../../store/authStore";
import { notify } from "../../lib/toast";
import { ketikApi } from "./ketikApi";
import { SessionReplayModal } from "./components/SessionReplayModal";
import {
  formatKetikDate,
  readFinalScore,
  reviewStatusLabel,
  sessionParticipant,
} from "./utils/reviewDisplay";
import {
  useKetikHistoryPage,
  useKetikHistoryExport,
} from "./hooks/useKetikHistoryPage";

type StatusFilter = "all" | "completed" | "running" | "failed" | "not_started";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "completed", label: "Ditelaah" },
  { value: "running", label: "Sedang ditelaah" },
  { value: "failed", label: "Gagal" },
  { value: "not_started", label: "Belum ditelaah" },
];

function statusOf(
  session: KetikHistorySummaryItem,
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

type PendingDelete =
  { kind: "one"; session: KetikHistorySummaryItem } | { kind: "all" };

export default function KetikHistory() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const {
    data,
    state,
    filter,
    query,
    setFilter,
    setQuery,
    page,
    reload: loadHistory,
    resetFilters,
    previous,
    next,
  } = useKetikHistoryPage();
  const { items: history, counts } = data;
  const visible = history;
  const csv = useKetikHistoryExport(filter, query);
  const [replay, setReplay] = useState<KetikSessionHistoryItem | null>(null);
  const [replayPending, setReplayPending] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const replayRequest = useRef(0);
  useEffect(() => {
    const invalidate = () => {
      replayRequest.current++;
    };
    invalidate();
    setReplay(null);
    setReplayError(null);
    setReplayPending(null);
    return invalidate;
  }, [userId]);
  const openReplay = async (id: string) => {
    const request = ++replayRequest.current;
    setReplayPending(id);
    setReplayError(null);
    try {
      const detail = await ketikApi.getHistoryDetail(id);
      if (request === replayRequest.current) setReplay(detail);
    } catch {
      if (request === replayRequest.current) setReplayError(id);
    } finally {
      if (request === replayRequest.current) setReplayPending(null);
    }
  };
  // `pendingDelete` dibiarkan terisi saat dialog menutup supaya teksnya tidak
  // berganti selama animasi tutup; `confirmOpen` yang mengatur tampil/tidak.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const summary =
    data.total === 0
      ? null
      : [
          `${data.total} sesi`,
          data.reviewedCount
            ? `${data.reviewedCount} ditelaah`
            : "belum ada yang ditelaah",
          ...(data.averageScore !== null
            ? [`rata-rata skor ${data.averageScore}`]
            : []),
        ].join(" · ");

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
        loadHistory();
      } else {
        await ketikApi.clearHistory();
        resetFilters();
        loadHistory();
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
            disabled={
              state !== "ready" || data.total === 0 || csv.progress !== null
            }
            onClick={() => void csv.run()}
          >
            <Download data-icon="inline-start" />
            {csv.progress !== null
              ? `Menyiapkan CSV… ${csv.progress} sesi`
              : "Unduh CSV"}
          </Button>
        </div>
        {summary && (
          <p className="text-[13px] font-medium text-fg2">{summary}</p>
        )}
      </header>

      <section aria-label="Sesi KETIK" className="flex flex-col gap-4">
        {csv.progress !== null && (
          <p role="status" className="text-[13px] text-fg2">
            Menyiapkan seluruh hasil filter: {csv.progress} sesi…
          </p>
        )}
        {csv.error && (
          <p role="alert" className="text-[13px] text-destructive">
            CSV belum bisa diunduh. Coba lagi; maksimum 10.000 sesi per ekspor.
            Tidak ada file parsial yang diunduh.
          </p>
        )}
        {replayPending && (
          <p role="status" className="text-[13px] text-fg2">
            Memuat transkrip…
          </p>
        )}
        {replayError && (
          <div role="alert" className="flex items-center gap-3 text-[13px]">
            Transkrip belum bisa dimuat.
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => void openReplay(replayError)}
            >
              Coba lagi
            </Button>
          </div>
        )}
        {(counts.all > 0 || query || filter !== "all") && (
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
                maxLength={120}
                aria-label="Cari sesi"
                placeholder="Cari skenario, peserta, konsumen"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
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
          ) : counts.all === 0 && !query && filter === "all" ? (
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
          ) : history.length === 0 ? (
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
                    onReplay={() => void openReplay(session.id)}
                    onDelete={() => askDelete({ kind: "one", session })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {state === "ready" && (page > 1 || data.nextCursor) && (
          <nav
            aria-label="Halaman riwayat"
            className="flex flex-wrap items-center justify-between gap-3 text-[13px]"
          >
            <p>
              Halaman {page} · {data.total} sesi
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-[44px]"
                disabled={page === 1}
                onClick={previous}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                className="min-h-[44px]"
                disabled={!data.nextCursor}
                onClick={next}
              >
                Berikutnya
              </Button>
            </div>
          </nav>
        )}
      </section>

      {state === "ready" && counts.all > 0 && (
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
            : "Semua sesi dan hasil telaahnya akan dihapus permanen, termasuk di luar filter aktif."
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
  session: KetikHistorySummaryItem;
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
