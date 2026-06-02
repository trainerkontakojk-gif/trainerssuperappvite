import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

interface SidakSelectionCardProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  delay?: number;
  onClick: () => void;
  testId?: string;
}

export default function SidakSelectionCard({
  icon,
  title,
  subtitle,
  delay = 0,
  onClick,
  testId,
}: SidakSelectionCardProps) {
  return (
    <motion.button
      data-testid={testId}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      type="button"
      onClick={onClick}
      className="group flex min-h-32 cursor-pointer flex-col items-start justify-between rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03] focus:outline-none focus:ring-2 focus:ring-primary/40"
      title={title}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <div className="mt-5 min-w-0">
        <div className="line-clamp-2 text-sm font-bold text-foreground/90">{title}</div>
        {subtitle && <div className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
    </motion.button>
  );
}
