import { cn } from "cn";

interface SegmentedFilterProps<T extends string> {
  label: string;
  value: T;
  options: readonly { id: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}

export function SegmentedFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedFilterProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
