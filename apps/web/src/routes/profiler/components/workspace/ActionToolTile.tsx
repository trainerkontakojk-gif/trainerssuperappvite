import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "cn";

interface ActionToolTileProps {
  icon: ReactNode;
  title: string;
  desc: string;
  onClick?: () => void;
  className?: string;
  accent?: "primary" | "profiler" | "pdkt" | "telefun" | "sidak" | "slate";
  disabled?: boolean;
}

const accentConfig = {
  primary: "bg-primary/10 text-primary",
  profiler: "bg-module-profiler/10 text-module-profiler",
  pdkt: "bg-module-pdkt/10 text-module-pdkt",
  telefun: "bg-module-telefun/10 text-module-telefun",
  sidak: "bg-module-sidak/10 text-module-sidak",
  slate: "bg-muted text-muted-foreground",
};

export default function ActionToolTile({
  icon,
  title,
  desc,
  onClick,
  className,
  accent = "primary",
  disabled = false,
}: ActionToolTileProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative h-auto min-h-36 w-full flex-col items-stretch justify-start gap-4 p-5 text-left whitespace-normal transition-colors hover:border-foreground/30 hover:bg-muted/40",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          accentConfig[accent],
        )}
      >
        {icon}
      </span>

      <span className="flex min-w-0 flex-col items-start gap-1">
        <span className="font-outfit text-sm font-semibold tracking-tight text-foreground">
          {title}
        </span>
        <span className="text-xs font-normal leading-relaxed text-muted-foreground">
          {desc}
        </span>
      </span>

      <ArrowUpRight
        aria-hidden="true"
        className="absolute top-4 right-4 size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
      />
    </Button>
  );
}
