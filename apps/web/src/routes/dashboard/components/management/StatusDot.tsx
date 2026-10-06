import { cn } from "cn";

export type StatusTone = "success" | "warning" | "danger" | "muted";

const TONE_DOT: Record<StatusTone, string> = {
  success: "bg-chart-green",
  warning: "bg-chart-amber",
  danger: "bg-chart-red",
  muted: "bg-muted-foreground/50",
};

/** Status dibaca dari teksnya; titik warna hanya penguat, bukan satu-satunya sinyal. */
export function StatusDot({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-foreground",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", TONE_DOT[tone])}
      />
      {label}
    </span>
  );
}
