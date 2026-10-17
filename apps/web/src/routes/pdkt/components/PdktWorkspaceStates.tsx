import { AlertCircle, Inbox, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { PDKT_NO_SUBJECT } from "../utils/emailDisplay";
import { PdktWorkspaceHeader } from "./PdktWorkspaceHeader";

/** Full-page skeleton while the mailbox list loads for the first time. */
export function PdktInboxLoading({ onBack }: { onBack?: () => void }) {
  return (
    <main className="relative flex h-screen w-full flex-col bg-background text-foreground">
      <PdktWorkspaceHeader mode="inbox" onBack={onBack} />
      <div role="status" className="flex min-h-0 flex-1">
        <span className="sr-only">Memuat kotak masuk…</span>
        <div className="flex w-full flex-col gap-4 border-r border-border p-4 md:w-[22rem]">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="flex flex-col gap-2 py-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
        <div className="hidden flex-1 flex-col gap-4 p-8 md:flex">
          <Skeleton className="h-9 w-72 rounded-full" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-40 w-full max-w-[720px]" />
        </div>
      </div>
    </main>
  );
}

/** Full-page error when the mailbox list never loaded. */
export function PdktInboxError({
  onBack,
  onRetry,
}: {
  onBack?: () => void;
  onRetry: () => void;
}) {
  return (
    <main className="relative flex h-screen w-full flex-col bg-background text-foreground">
      <PdktWorkspaceHeader mode="inbox" onBack={onBack} />
      <div className="flex flex-1 items-center justify-center px-4">
        <Alert variant="destructive" className="max-w-md items-start">
          <AlertCircle aria-hidden="true" />
          <div>
            <AlertDescription className="font-semibold text-foreground">
              Kotak masuk belum bisa dimuat
            </AlertDescription>
            <p className="mt-1 text-xs leading-relaxed text-foreground">
              Periksa koneksi Anda, lalu coba lagi. Email yang sudah ada tidak
              hilang.
            </p>
          </div>
          <Button
            type="button"
            onClick={onRetry}
            className="ml-auto min-h-[44px] gap-2 text-xs"
          >
            <RefreshCw aria-hidden="true" />
            Coba lagi
          </Button>
        </Alert>
      </div>
    </main>
  );
}

/** The selected email's detail is still loading, or failed to load. */
export function PdktDetailPending({
  failed,
  onBackToList,
  onRetry,
}: {
  failed: boolean;
  onBackToList: () => void;
  onRetry: () => void;
}) {
  if (!failed) {
    return (
      <div role="status" className="flex flex-1 flex-col gap-4 p-6">
        <span className="sr-only">Memuat detail email…</span>
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-4 md:p-6">
      <Alert variant="destructive" className="max-w-lg items-start">
        <AlertCircle aria-hidden="true" />
        <div>
          <AlertDescription className="font-semibold text-foreground">
            Email belum bisa dimuat
          </AlertDescription>
          <p className="mt-1 text-sm leading-6 text-foreground">
            Periksa koneksi Anda, lalu coba lagi. Email Anda tetap tersimpan.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onBackToList}
              className="min-h-[44px] text-foreground"
            >
              Kembali ke daftar email
            </Button>
            <Button type="button" onClick={onRetry} className="min-h-[44px]">
              Coba lagi
            </Button>
          </div>
        </div>
      </Alert>
    </div>
  );
}

/** Detail pane placeholder when no email is selected. */
export function PdktEmptyDetail({
  canCreateEmail,
  onNew,
}: {
  canCreateEmail: boolean;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-card p-12 text-center">
      <Inbox aria-hidden="true" className="size-10 text-muted-foreground" />
      <p className="max-w-xs text-sm text-muted-foreground">
        Pilih email dari kotak masuk, atau buat email baru untuk mulai berlatih.
      </p>
      <Button
        type="button"
        onClick={onNew}
        disabled={!canCreateEmail}
        className="min-h-[44px] text-xs"
      >
        Buat email baru
      </Button>
    </div>
  );
}

/** Banner offering to file a generated consumer email that failed to save. */
export function PdktMailboxRetryBanner({
  subjectLabel,
  isRetrying,
  onRetry,
  onDismiss,
}: {
  subjectLabel?: string;
  isRetrying: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <Alert
      variant="destructive"
      className="flex shrink-0 flex-col gap-3 rounded-none border-x-0 border-t-0 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <AlertDescription className="font-semibold text-foreground">
          Email konsumen belum masuk ke kotak masuk
        </AlertDescription>
        <p className="truncate text-xs text-foreground">
          {subjectLabel || PDKT_NO_SUBJECT}: simpan lagi tanpa membuat ulang
          email.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="min-h-[44px] gap-2 text-xs"
        >
          <RefreshCw
            aria-hidden="true"
            className={
              isRetrying ? "animate-spin motion-reduce:animate-none" : ""
            }
          />
          {isRetrying ? "Menyimpan…" : "Simpan lagi"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDismiss}
          disabled={isRetrying}
          className="min-h-[44px] text-xs"
        >
          Tutup
        </Button>
      </div>
    </Alert>
  );
}
