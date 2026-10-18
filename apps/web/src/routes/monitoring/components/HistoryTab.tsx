import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { can, normalizeRole } from "@trainers/types";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  aiClient,
  unwrapResponse,
  type MonitoringReviewByModule,
  type MonitoringSessionPage,
  type MonitoringSessionRow,
} from "../../../lib/api";
import { notify } from "../../../lib/toast";
import { useAuthStore } from "../../../store/authStore";
import { ConfirmDialog } from "../../dashboard/components/management/ConfirmDialog";
import {
  hasHistoryFilters,
  MODULE_LABELS,
  STATUS_SLUGS,
  validateHistorySearch,
  type HistorySearch,
} from "../history-search";
import {
  formatSessionTime,
  mapError,
  type UnifiedHistoryEntry,
} from "../utils/formatting";
import { HistoryFilters } from "./HistoryFilters";
import { HistoryPager, HistoryTable } from "./HistoryTable";
import { ReviewDetailModal } from "./ReviewDetailModal";

type Review = MonitoringReviewByModule[MonitoringSessionRow["module"]];

/** Modal detail lama masih memakai bentuk riwayat penuh. */
function toEntry(row: MonitoringSessionRow): UnifiedHistoryEntry {
  return {
    id: row.id,
    user_id: row.user_id ?? "",
    module: row.module,
    scenario_title: row.scenario_title,
    created_at: row.occurred_at,
    duration_seconds: row.duration_seconds ?? 0,
    score: row.score,
    history: null,
    user_email: row.actor.email ?? undefined,
    user_role: row.actor.role ?? undefined,
    review_status: row.review_status,
    simulationSubject: row.simulationSubject,
    telefun_legacy: row.legacy || undefined,
  };
}

function SummaryLine({ data }: { data: MonitoringSessionPage }) {
  const { counts } = data;
  const items: Array<[string, number]> = [
    ["KETIK", counts.ketik],
    ["PDKT", counts.pdkt],
    ["Telefun", counts.telefun],
  ];
  const statuses: Array<[string, number]> = [
    ["Diproses", counts.processing],
    ["Gagal", counts.failed],
    ["Belum dinilai", counts.not_started],
  ];
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span>
        <b className="font-semibold text-foreground tabular-nums">
          {data.total}
        </b>{" "}
        sesi
      </span>
      {items.map(([label, value]) => (
        <span key={label}>
          {label}{" "}
          <b className="font-semibold text-foreground tabular-nums">{value}</b>
        </span>
      ))}
      <span aria-hidden="true">·</span>
      {statuses.map(([label, value]) => (
        <span key={label}>
          {label}{" "}
          <b className="font-semibold text-foreground tabular-nums">{value}</b>
        </span>
      ))}
    </p>
  );
}

function ScopeNote({ scope }: { scope: MonitoringSessionPage["scope"] }) {
  if (scope.kind !== "team") return null;
  const names = [...scope.teams, ...scope.batches];
  return (
    <p className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
      Menampilkan peserta dari tim yang aksesnya sudah disetujui
      {names.length ? `: ${names.join(", ")}` : ""}.
    </p>
  );
}

function EmptyState({
  data,
  filtered,
  onClear,
}: {
  data: MonitoringSessionPage;
  filtered: boolean;
  onClear: () => void;
}) {
  const [title, body] =
    data.scope.kind === "none"
      ? [
          "Belum ada tim yang bisa ditampilkan",
          "Riwayat muncul setelah akses timmu disetujui admin.",
        ]
      : filtered
        ? [
            "Tidak ada sesi yang cocok",
            "Ubah atau hapus filter untuk melihat sesi lain.",
          ]
        : [
            "Belum ada riwayat simulasi",
            "Sesi KETIK, PDKT, dan Telefun muncul di sini setelah agen berlatih.",
          ];
  return (
    <div className="grid justify-items-center gap-2 px-5 py-10 text-center">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      {filtered && data.scope.kind !== "none" ? (
        <Button
          type="button"
          variant="outline"
          onClick={onClear}
          className="mt-1 min-h-11"
        >
          Hapus filter
        </Button>
      ) : null}
    </div>
  );
}

export function HistoryTab() {
  const navigate = useNavigate();
  const search = validateHistorySearch(useSearch({ strict: false }));
  const page = search.hal ?? 1;
  const role = normalizeRole(useAuthStore((s) => s.profile?.role));
  const canDelete = can(role, "monitoring.history.delete");

  const [data, setData] = useState<MonitoringSessionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MonitoringSessionRow | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MonitoringSessionRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const searchKey = JSON.stringify(search);
  const fetchPage = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await unwrapResponse(
        await aiClient["monitoring/history"].$get({
          query: {
            ...(search.modul ? { module: search.modul } : {}),
            ...(search.status ? { status: STATUS_SLUGS[search.status] } : {}),
            ...(search.dari ? { from: search.dari } : {}),
            ...(search.sampai ? { to: search.sampai } : {}),
            ...(search.q ? { q: search.q } : {}),
            ...(page > 1 ? { page: String(page) } : {}),
          },
        }),
      );
      setData(result);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPage();
  }, [searchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSearch = (patch: Partial<HistorySearch>) => {
    // Filter baru selalu mulai dari halaman pertama.
    const next = { ...search, hal: undefined, ...patch };
    navigate({
      to: "/monitoring",
      search: validateHistorySearch(next as Record<string, unknown>),
    });
  };

  const loadReview = async (row: MonitoringSessionRow) => {
    setReview(null);
    setReviewError(null);
    setReviewLoading(true);
    try {
      setReview(
        await unwrapResponse(
          await aiClient["monitoring/history/:module/:id/review"].$get({
            param: { module: row.module, id: row.id },
          }),
        ),
      );
    } catch (err) {
      setReviewError(mapError(err));
    } finally {
      setReviewLoading(false);
    }
  };

  const openDetail = (row: MonitoringSessionRow) => {
    setSelected(row);
    void loadReview(row);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await unwrapResponse(
        await aiClient["monitoring/history/:module/:id"].$delete({
          param: { module: deleting.module, id: deleting.id },
        }),
      );
      notify.success("Sesi dihapus.");
      setDeleting(null);
      // Halaman terakhir yang kosong sesudah dihapus kembali ke halaman sebelumnya.
      if (data && data.rows.length === 1 && page > 1) {
        updateSearch({ ...search, hal: page - 1 });
      } else {
        void fetchPage();
      }
    } catch (err) {
      notify.error("Gagal menghapus sesi.", mapError(err));
    } finally {
      setDeletePending(false);
    }
  };

  const filtered = hasHistoryFilters(search);

  return (
    <div className="flex flex-col gap-4 pt-6">
      <HistoryFilters search={search} onChange={updateSearch} />
      {data ? <ScopeNote scope={data.scope} /> : null}
      {data && data.total > 0 ? <SummaryLine data={data} /> : null}

      {error ? (
        <Alert variant="destructive" className="items-center">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void fetchPage()}
            className="ml-auto min-h-11"
          >
            Coba lagi
          </Button>
        </Alert>
      ) : null}

      <section
        aria-busy={loading}
        className="overflow-hidden rounded-xl border border-border bg-card"
      >
        {loading && !data ? (
          <div
            role="status"
            className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"
          >
            <Skeleton className="size-4 rounded-full" />
            Memuat riwayat…
          </div>
        ) : data && data.rows.length > 0 ? (
          <>
            <HistoryTable
              rows={data.rows}
              canDelete={canDelete}
              onOpen={openDetail}
              onDelete={setDeleting}
            />
            <HistoryPager
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              onPage={(next) => updateSearch({ ...search, hal: next })}
            />
          </>
        ) : data ? (
          <EmptyState
            data={data}
            filtered={filtered}
            onClear={() => navigate({ to: "/monitoring", search: {} })}
          />
        ) : null}
      </section>

      {selected ? (
        <ReviewDetailModal
          entry={toEntry(selected)}
          durationSeconds={selected.duration_seconds}
          reviewData={review}
          reviewLoading={reviewLoading}
          reviewError={reviewError}
          onRetry={() => void loadReview(selected)}
          onClose={() => setSelected(null)}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleting(null);
        }}
        title="Hapus sesi ini?"
        description={
          deleting
            ? `${MODULE_LABELS[deleting.module]} · ${deleting.scenario_title}, ${deleting.participant.name ?? "peserta tidak tercatat"}, ${formatSessionTime(deleting.occurred_at)}. Transkrip dan penilaian AI sesi ini ikut terhapus dan tidak bisa dikembalikan. Catatan biaya AI tetap disimpan.`
            : ""
        }
        confirmLabel="Hapus sesi"
        tone="destructive"
        pending={deletePending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
