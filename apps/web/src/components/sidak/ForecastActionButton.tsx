import React from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { SidakForecastLookupStatus } from "@trainers/types";

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

  const baseClasses = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
  
  const sizeClasses = compact ? "h-9 px-3 text-sm" : "min-h-11 px-4 py-2 text-base";
  
  const variantClasses = isStale
    ? "bg-primary text-primary-foreground ring-2 ring-primary/30 shadow-sm animate-pulse motion-reduce:animate-none hover:bg-primary/90"
    : "bg-primary/10 text-primary hover:bg-primary/20";

  return (
    <button
      type="button"
      className={`${baseClasses} ${sizeClasses} ${variantClasses}`}
      disabled={disabled || loading}
      onClick={onClick}
      aria-label={loading ? "Sedang memproses..." : label}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="mr-2 h-4 w-4" />
      )}
      {loading ? "Sedang memproses..." : label}
    </button>
  );
}
