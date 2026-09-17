import { Loader2, RefreshCw } from "lucide-react";
import type { SidakForecastLookupStatus } from "@trainers/types";
import { Button } from "@/components/ui/button";

interface ForecastActionButtonProps {
  status: SidakForecastLookupStatus;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  compact?: boolean;
}

export function ForecastActionButton({
  status,
  loading,
  disabled,
  onClick,
  compact,
}: ForecastActionButtonProps) {
  const label =
    status === "stale"
      ? "Data baru — Perbarui Prediksi"
      : status === "fresh"
        ? "Perbarui Prediksi"
        : "Update Prediksi";

  const isStale = status === "stale" && !loading;

  return (
    <Button
      type="button"
      variant={isStale ? "default" : "outline"}
      size={compact ? "sm" : "lg"}
      className={
        isStale
          ? "min-h-[44px] animate-pulse ring-2 ring-primary/30 motion-reduce:animate-none hover:bg-primary/90"
          : "min-h-[44px] border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
      }
      disabled={disabled || loading}
      onClick={onClick}
      aria-label={loading ? "Sedang memproses..." : label}
    >
      {loading ? (
        <Loader2
          data-icon="inline-start"
          className="animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <RefreshCw data-icon="inline-start" aria-hidden="true" />
      )}
      {loading ? "Sedang memproses..." : label}
    </Button>
  );
}
