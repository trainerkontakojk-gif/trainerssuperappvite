import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
} from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { can, normalizeRole } from "@trainers/types";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  aiClient,
  unwrapResponse,
  type MonitoringSessionPage,
  type MonitoringSessionRow,
} from "../../../lib/api";
import { notify } from "../../../lib/toast";
import { useAuthStore } from "../../../store/authStore";
import { ConfirmDialog } from "../../dashboard/components/management/ConfirmDialog";
import {
  hasHistoryFilters,
  MODULE_LABELS,
  rememberHistorySearch,
  STATUS_SLUGS,
  validateHistorySearch,
  type HistorySearch,
} from "../history-search";
import { copySessionLink } from "../session-link";
import { formatSessionTime, mapError } from "../utils/formatting";
import { HistoryFilters } from "./HistoryFilters";
import { HistoryPager, HistoryTable } from "./HistoryTable";

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

type HistoryLoad =
  | {
      phase: "loading";
      requestId: number;
      data: MonitoringSessionPage | null;
      error: null;
    }
  | {
      phase: "ready";
      requestId: number;
      data: MonitoringSessionPage;
      error: null;
    }
  | {
      phase: "failed";
      requestId: number;
      data: MonitoringSessionPage | null;
      error: string;
    };
type HistoryDelete =
  | { phase: "idle"; target: null }
  | { phase: "confirming" | "deleting"; target: MonitoringSessionRow };
type HistoryState = { load: HistoryLoad; deletion: HistoryDelete };
type HistoryAction =
  | { type: "load"; requestId: number }
  | { type: "loaded"; requestId: number; data: MonitoringSessionPage }
  | { type: "load-failed"; requestId: number; error: string }
  | { type: "confirm-delete"; target: MonitoringSessionRow }
  | { type: "dismiss-delete" }
  | { type: "delete-started" }
  | { type: "delete-succeeded" }
  | { type: "delete-failed" };

function historyReducer(
  state: HistoryState,
  action: HistoryAction,
): HistoryState {
  switch (action.type) {
    case "load":
      return {
        ...state,
        load: {
          phase: "loading",
          requestId: action.requestId,
          data: state.load.data,
          error: null,
        },
      };
    case "loaded":
      return action.requestId !== state.load.requestId
        ? state
        : {
            ...state,
            load: {
              phase: "ready",
              requestId: action.requestId,
              data: action.data,
              error: null,
            },
          };
    case "load-failed":
      return action.requestId !== state.load.requestId
        ? state
        : {
            ...state,
            load: {
              phase: "failed",
              requestId: action.requestId,
              data: state.load.data,
              error: action.error,
            },
          };
    case "confirm-delete":
      return state.deletion.phase === "deleting"
        ? state
        : {
            ...state,
            deletion: { phase: "confirming", target: action.target },
          };
    case "dismiss-delete":
      return state.deletion.phase === "deleting"
        ? state
        : { ...state, deletion: { phase: "idle", target: null } };
    case "delete-started":
      return state.deletion.phase !== "confirming"
        ? state
        : {
            ...state,
            deletion: { phase: "deleting", target: state.deletion.target },
          };
    case "delete-succeeded":
      return { ...state, deletion: { phase: "idle", target: null } };
    case "delete-failed":
      return state.deletion.phase !== "deleting"
        ? state
        : {
            ...state,
            deletion: { phase: "confirming", target: state.deletion.target },
          };
  }
}

export function HistoryTab() {
  const navigate = useNavigate();
  const search = validateHistorySearch(useSearch({ strict: false }));
  const page = search.hal ?? 1;
  const role = normalizeRole(useAuthStore((s) => s.profile?.role));
  const canDelete = can(role, "monitoring.history.delete");

  const [state, dispatch] = useReducer(historyReducer, {
    load: { phase: "loading", requestId: 0, data: null, error: null },
    deletion: { phase: "idle", target: null },
  });
  const { data, error } = state.load;
  const loading = state.load.phase === "loading";
  const deleting = state.deletion.target;
  const deletePending = state.deletion.phase === "deleting";
  const generation = useRef(0);
  const mounted = useRef(true);
  const deleteInFlight = useRef(false);
  const searchKey = JSON.stringify(search);
  const current = useRef({ search, searchKey, page, data });
  // Publish only committed context; speculative renders must not own requests.
  useLayoutEffect(() => {
    current.current = { search, searchKey, page, data };
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);

  const fetchPage = useCallback(async () => {
    const { search, page } = current.current;
    const requestId = ++generation.current;
    dispatch({ type: "load", requestId });
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
      if (mounted.current && requestId === generation.current)
        dispatch({ type: "loaded", requestId, data: result });
    } catch (err) {
      if (mounted.current && requestId === generation.current)
        dispatch({ type: "load-failed", requestId, error: mapError(err) });
    }
  }, [dispatch]);

  useEffect(() => {
    rememberHistorySearch(current.current.search);
    void fetchPage();
    return () => {
      generation.current++;
    };
  }, [searchKey, fetchPage]);

  const updateSearch = (patch: Partial<HistorySearch>) => {
    // Filter baru selalu mulai dari halaman pertama.
    const next = { ...search, hal: undefined, ...patch };
    navigate({
      to: "/monitoring",
      search: validateHistorySearch(next as Record<string, unknown>),
    });
  };

  const openDetail = (row: MonitoringSessionRow) => {
    void navigate({
      to: "/monitoring/sesi/$modul/$id",
      params: { modul: row.module, id: row.id },
    });
  };

  const confirmDelete = async () => {
    if (
      !deleting ||
      deleteInFlight.current ||
      state.deletion.phase !== "confirming"
    )
      return;
    deleteInFlight.current = true;
    const startedFor = current.current.searchKey;
    dispatch({ type: "delete-started" });
    try {
      await unwrapResponse(
        await aiClient["monitoring/history/:module/:id"].$delete({
          param: { module: deleting.module, id: deleting.id },
        }),
      );
      if (!mounted.current) return;
      notify.success("Sesi dihapus.");
      dispatch({ type: "delete-succeeded" });
      // Halaman terakhir yang kosong sesudah dihapus kembali ke halaman sebelumnya.
      const latest = current.current;
      if (
        startedFor === latest.searchKey &&
        latest.data?.rows.length === 1 &&
        latest.page > 1 &&
        latest.data.rows[0]?.id === deleting.id &&
        latest.data.rows[0]?.module === deleting.module
      ) {
        void navigate({
          to: "/monitoring",
          search: validateHistorySearch({
            ...latest.search,
            hal: latest.page - 1,
          }),
        });
      } else {
        void fetchPage();
      }
    } catch (err) {
      if (mounted.current) {
        notify.error("Gagal menghapus sesi.", mapError(err));
        dispatch({ type: "delete-failed" });
      }
    } finally {
      deleteInFlight.current = false;
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
              onCopyLink={(row) => void copySessionLink(row.module, row.id)}
              onDelete={(target) =>
                dispatch({ type: "confirm-delete", target })
              }
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

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: "dismiss-delete" });
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
