import { Loader2, AlertCircle, TriangleAlert, CheckCircle2, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

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
  warning: { border: "border-amber-500/25", bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400" },
  success: { border: "border-emerald-500/25", bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400" },
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

  if (type === "empty") {
    return (
      <Empty className={`border ${tone.border} bg-muted/35 ${compact ? "p-4" : "p-6 sm:p-8"} ${className}`}>
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-background text-muted-foreground">
            <Icon aria-hidden="true" className="size-5" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          {description ? <EmptyDescription>{description}</EmptyDescription> : null}
        </EmptyHeader>
        {action ? <div className="mt-1">{action}</div> : null}
      </Empty>
    );
  }

  return (
    <Alert
      role={type === "error" ? "alert" : "status"}
      variant={type === "error" ? "destructive" : "default"}
      className={`${tone.border} ${tone.bg} ${compact ? "p-3" : "p-4 sm:p-5"} ${className}`}
    >
      <Icon
        aria-hidden="true"
        className={`${type === "loading" ? "animate-spin motion-reduce:animate-none" : ""} ${tone.text}`}
      />
      <AlertTitle className="text-sm font-semibold leading-snug tracking-tight">
        {title}
      </AlertTitle>
      {description ? (
        <AlertDescription className="mt-1.5 leading-relaxed">
          {description}
        </AlertDescription>
      ) : null}
      {action ? <div className={`${compact ? "mt-2" : "mt-3"}`}>{action}</div> : null}
    </Alert>
  );
}
