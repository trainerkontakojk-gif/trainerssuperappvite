import { Loader2, AlertCircle, TriangleAlert, CheckCircle2, Inbox } from "lucide-react";
import type { ReactNode } from "react";

const ICONS = {
  loading: Loader2,
  error: AlertCircle,
  warning: TriangleAlert,
  success: CheckCircle2,
  empty: Inbox,
};

const TONES: Record<string, { border: string; bg: string; text: string }> = {
  loading: { border: "border-primary/20", bg: "bg-primary/5", text: "text-primary" },
  error: { border: "border-destructive/25", bg: "bg-destructive/10", text: "text-destructive" },
  warning: { border: "border-amber-500/25", bg: "bg-amber-500/10", text: "text-amber-600" },
  success: { border: "border-emerald-500/25", bg: "bg-emerald-500/10", text: "text-emerald-600" },
  empty: { border: "border-border/50", bg: "bg-muted/35", text: "text-muted-foreground" },
};

interface Props {
  type: "loading" | "error" | "empty" | "warning" | "success";
  title: string;
  description?: string;
  compact?: boolean;
  action?: ReactNode;
  className?: string;
}

export default function QaStatePanel({ type, title, description, compact, action, className = "" }: Props) {
  const Icon = ICONS[type];
  const tone = TONES[type];

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={`rounded-2xl border ${tone.border} ${tone.bg} ${compact ? "p-3" : "p-4 sm:p-5"} ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-xl bg-background/80 shadow-sm ${compact ? "p-1.5" : "p-2.5"}`}>
          <Icon className={`h-5 w-5 ${type === "loading" ? "animate-spin" : ""} ${tone.text}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`${compact ? "text-xs" : "text-sm"} font-semibold leading-snug tracking-tight`}>
            {title}
          </p>
          {description && (
            <p className={`${compact ? "text-[11px]" : "text-xs"} mt-1.5 leading-relaxed opacity-90`}>
              {description}
            </p>
          )}
          {action && <div className={`${compact ? "mt-2" : "mt-3"}`}>{action}</div>}
        </div>
      </div>
    </div>
  );
}
