import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { AlertCircle, ChevronLeft, Link2 } from "lucide-react";
import { can, normalizeRole } from "@trainers/types";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { aiClient, ApiError, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import { copySessionLink } from "./session-link";
import { useAuthStore } from "../../store/authStore";
import { ConfirmDialog } from "../dashboard/components/management/ConfirmDialog";
import {
  SessionReview,
  type SessionReviewData,
} from "./components/SessionReview";
import { sessionHeading } from "./components/session/heading";
import { lastHistorySearch, MODULE_LABELS } from "./history-search";
import { formatSessionTime, mapError } from "./utils/formatting";

type Module = SessionReviewData["module"];
const MODULES: readonly Module[] = ["ketik", "pdkt", "telefun"];

function BackLink() {
  return (
    <Link
      to="/monitoring"
      search={lastHistorySearch()}
      className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      Kembali ke Riwayat
    </Link>
  );
}

export default function SessionPage() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    modul?: string;
    id?: string;
  };
  const module = MODULES.find((value) => value === params.modul);
  const id = params.id ?? "";
  const role = normalizeRole(useAuthStore((s) => s.profile?.role));
  const canDelete = can(role, "monitoring.history.delete");

  const [review, setReview] = useState<SessionReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(!module);
  const [attempt, setAttempt] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    if (!module) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    void (async () => {
      try {
        const data = await unwrapResponse(
          await aiClient["monitoring/history/:module/:id/review"].$get({
            param: { module, id },
          }),
        );
        if (!cancelled) setReview(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "NOT_FOUND")
          setNotFound(true);
        else setError(mapError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [module, id, attempt]);

  if (notFound || !module) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 sm:px-6">
        <BackLink />
        <h1 className="text-page-title font-display text-foreground">
          Sesi tidak ditemukan
        </h1>
        <p className="text-sm text-muted-foreground">
          Sesi ini sudah dihapus, alamatnya salah, atau di luar tim yang bisa
          kamu lihat.
        </p>
      </div>
    );
  }

  const heading = review ? sessionHeading(review) : null;

  const confirmDelete = async () => {
    setDeletePending(true);
    try {
      await unwrapResponse(
        await aiClient["monitoring/history/:module/:id"].$delete({
          param: { module, id },
        }),
      );
      notify.success("Sesi dihapus.");
      setDeleting(false);
      void navigate({ to: "/monitoring", search: lastHistorySearch() });
    } catch (err) {
      notify.error("Gagal menghapus sesi.", mapError(err));
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <BackLink />
          {heading ? (
            <>
              <h1 className="mt-1 break-words text-page-title font-display text-foreground">
                {heading.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {heading.meta}
              </p>
            </>
          ) : (
            <h1 className="mt-1 text-page-title font-display text-foreground">
              Detail sesi {MODULE_LABELS[module]}
            </h1>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => void copySessionLink(module, id)}
          >
            <Link2 data-icon="inline-start" aria-hidden="true" />
            Salin tautan
          </Button>
          {canDelete && review ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 text-destructive hover:text-destructive"
              onClick={() => setDeleting(true)}
            >
              Hapus sesi
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" className="items-center">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setAttempt((n) => n + 1)}
            className="ml-auto min-h-11"
          >
            Coba lagi
          </Button>
        </Alert>
      ) : null}

      {loading && !review ? (
        <div
          role="status"
          className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
        >
          <Skeleton className="size-4 rounded-full" />
          Memuat sesi…
        </div>
      ) : review ? (
        <SessionReview review={review} />
      ) : null}

      {heading ? (
        <ConfirmDialog
          open={deleting}
          onOpenChange={(open) => {
            if (!open && !deletePending) setDeleting(false);
          }}
          title="Hapus sesi ini?"
          description={`${MODULE_LABELS[module]} · ${heading.title}, ${heading.participant ?? "peserta tidak tercatat"}${heading.occurredAt ? `, ${formatSessionTime(heading.occurredAt)}` : ""}. Transkrip dan penilaian AI sesi ini ikut terhapus dan tidak bisa dikembalikan. Catatan biaya AI tetap disimpan.`}
          confirmLabel="Hapus sesi"
          tone="destructive"
          pending={deletePending}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}
