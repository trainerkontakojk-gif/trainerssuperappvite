import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Inbox,
  Loader2,
  TriangleAlert,
} from "lucide-react";

interface QaStatePanelProps {
  type: "error" | "empty" | "loading" | "warning" | "success";
  title: string;
  description?: string;
  compact?: boolean;
  action?: React.ReactNode;
  className?: string;
}

export default function QaStatePanel({
  type,
  title,
  description,
  compact = false,
  action,
  className = "",
}: QaStatePanelProps) {
  const icon =
    type === "loading" ? (
      <Loader2 className="h-5 w-5 animate-spin" />
    ) : type === "error" ? (
      <AlertCircle className="h-5 w-5" />
    ) : type === "warning" ? (
      <TriangleAlert className="h-5 w-5" />
    ) : type === "success" ? (
      <CheckCircle2 className="h-5 w-5" />
    ) : (
      <Inbox className="h-5 w-5" />
    );

  const tone =
    type === "loading"
      ? "border-primary/20 bg-primary/5 text-primary"
      : type === "error"
        ? "border-destructive/25 bg-destructive/10 text-destructive"
        : type === "warning"
          ? "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300"
          : type === "success"
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
            : "border-border/50 bg-muted/35 text-muted-foreground";

  return (
    <div
      className={`rounded-2xl border ${tone} ${
        compact ? "p-3" : "p-4 sm:p-5"
      } ${className}`}
      role={type === "error" ? "alert" : "status"}
    >
      <div
        className={`flex ${
          compact ? "items-center gap-2" : "items-start gap-3.5"
        }`}
      >
        <div
          className={`rounded-xl ${
            compact ? "p-1.5" : "p-2.5"
          } bg-background/80 shadow-sm`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`${
              compact ? "text-xs" : "text-sm"
            } font-semibold leading-snug tracking-tight`}
          >
            {title}
          </p>
          {description ? (
            <p
              className={`${
                compact ? "text-[11px]" : "text-xs"
              } mt-1.5 leading-relaxed opacity-90`}
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? (
        <div className={`${compact ? "mt-2" : "mt-3"}`}>{action}</div>
      ) : null}
    </div>
  );
}
