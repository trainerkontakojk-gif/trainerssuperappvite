import { Check } from "lucide-react";
import { cn } from "cn";

export type PdktStage = "pahami" | "tanggapi" | "telaah";

const STAGES: { id: PdktStage; label: string }[] = [
  { id: "pahami", label: "Pahami" },
  { id: "tanggapi", label: "Tanggapi" },
  { id: "telaah", label: "Telaah" },
];

interface Props {
  current: PdktStage;
  /** Tahap yang bisa dibuka dengan klik. Telaah tidak pernah dibuka dari sini. */
  onSelect?: Partial<Record<Exclude<PdktStage, "telaah">, () => void>>;
  className?: string;
}

const pill =
  "inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-medium";

/** Navigasi tiga tahap latihan; Telaah terkunci sampai balasan dikirim. */
export function PdktStageNav({ current, onSelect = {}, className }: Props) {
  const currentIndex = STAGES.findIndex((stage) => stage.id === current);

  return (
    <nav
      aria-label="Tahap latihan"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}
    >
      <ol className="flex flex-wrap items-center gap-2">
        {STAGES.map((stage, index) => {
          const done = index < currentIndex;
          const marker = (
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold",
                index === currentIndex
                  ? "bg-background text-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
            </span>
          );
          const handler =
            stage.id === "telaah" || index === currentIndex
              ? undefined
              : onSelect[stage.id];

          return (
            <li key={stage.id} className="flex items-center gap-2">
              {index > 0 && (
                <span aria-hidden="true" className="h-px w-5 bg-border max-sm:hidden" />
              )}
              {index === currentIndex ? (
                <span
                  aria-current="step"
                  className={cn(
                    pill,
                    "bg-foreground font-semibold text-background",
                  )}
                >
                  {marker}
                  {stage.label}
                </span>
              ) : handler ? (
                <button
                  type="button"
                  onClick={handler}
                  className={cn(
                    pill,
                    "border border-border text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  {marker}
                  {stage.label}
                  {done && <span className="sr-only"> (selesai)</span>}
                </button>
              ) : (
                <span
                  aria-disabled={done ? undefined : "true"}
                  className={cn(
                    pill,
                    "border border-border text-muted-foreground",
                    !done && "border-dashed",
                  )}
                >
                  {marker}
                  {stage.label}
                  {done && <span className="sr-only"> (selesai)</span>}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {current !== "telaah" && (
        <span className="text-xs text-muted-foreground max-sm:sr-only">
          Telaah terbuka setelah balasan dikirim
        </span>
      )}
    </nav>
  );
}
