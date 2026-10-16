import { AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import type { PdktSettingsState } from "../utils/usePdktSettings";

export function PdktSettingsNotice({
  status,
  onRetry,
}: {
  status: PdktSettingsState;
  onRetry: () => void;
}) {
  if (status === "ready") return null;
  if (status === "loading")
    return (
      <p
        role="status"
        className="shrink-0 px-4 py-3 text-sm text-muted-foreground"
      >
        Pengaturan sedang dimuat…
      </p>
    );
  return (
    <Alert variant="destructive" className="m-4 w-auto shrink-0 items-start">
      <AlertCircle aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <AlertDescription className="font-semibold text-foreground">
            Pengaturan belum bisa dimuat
          </AlertDescription>
          <p className="mt-1 text-xs leading-5 text-foreground">
            Coba lagi sebelum membuat email baru. Email yang sudah ada tetap
            bisa dibaca.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          className="min-h-[44px] shrink-0 gap-2 text-xs text-foreground"
        >
          <RefreshCw data-icon="inline-start" />
          Coba lagi
        </Button>
      </div>
    </Alert>
  );
}
