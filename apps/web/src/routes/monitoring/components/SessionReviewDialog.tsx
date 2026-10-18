import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionReview, type SessionReviewData } from "./SessionReview";
import { sessionHeading } from "./session/heading";

/**
 * Detail sesi dalam jendela, untuk riwayat simulasi di SIDAK. Isinya sama
 * dengan halaman sesi Monitoring.
 */
export function SessionReviewDialog({
  title,
  review,
  loading,
  error,
  onRetry,
  onClose,
}: {
  /** Judul dari baris daftar, dipakai sebelum detail termuat. */
  title: string;
  review: SessionReviewData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const heading = review ? sessionHeading(review) : null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="!w-[calc(100vw-2rem)] !max-w-4xl flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-14 sm:px-6">
          <DialogTitle className="break-words font-display text-lg">
            {heading?.title ?? title}
          </DialogTitle>
          <DialogDescription>
            {heading?.meta ?? "Detail sesi simulasi dan penilaiannya."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {error ? (
            <Alert variant="destructive" className="items-center">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
              <Button
                type="button"
                variant="ghost"
                onClick={onRetry}
                className="ml-auto min-h-11"
              >
                Coba lagi
              </Button>
            </Alert>
          ) : loading || !review ? (
            <div
              role="status"
              className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
            >
              <Skeleton className="size-4 rounded-full" />
              Memuat sesi…
            </div>
          ) : (
            <SessionReview review={review} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
