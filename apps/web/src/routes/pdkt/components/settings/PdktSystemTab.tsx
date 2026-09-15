import { cn } from "cn";
import { Button } from "../../../../components/ui/button";
import { TEXT_MODELS } from "../../pdktSettings";

export interface PdktSystemTabProps {
  writingStyleMode: "realistic" | "training";
  setWritingStyleMode: React.Dispatch<
    React.SetStateAction<"realistic" | "training">
  >;
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
}

const writingStyles = [
  {
    id: "realistic" as const,
    label: "Realistis",
    description:
      "Email mengandung typo, capslock, dan bahasa informal/kurang berpendidikan untuk simulasi yang lebih nyata.",
  },
  {
    id: "training" as const,
    label: "Latihan",
    description:
      "Email menggunakan bahasa yang rapi, terstruktur, dan formal untuk tahap awal pelatihan.",
  },
];

function RadioIndicator({ isSelected }: { isSelected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border",
        isSelected ? "border-primary" : "border-border",
      )}
    >
      {isSelected && <span className="size-2.5 rounded-full bg-primary" />}
    </span>
  );
}

export function PdktSystemTab({
  writingStyleMode,
  setWritingStyleMode,
  selectedModel,
  setSelectedModel,
}: PdktSystemTabProps) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Mode penulisan
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Menentukan gaya bahasa email konsumen yang dihasilkan AI pada setiap
            sesi simulasi.
          </p>
        </div>

        <div
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          role="radiogroup"
          aria-label="Mode penulisan"
        >
          {writingStyles.map((style) => {
            const isSelected = writingStyleMode === style.id;
            return (
              <Button
                key={style.id}
                type="button"
                variant="outline"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setWritingStyleMode(style.id)}
                className={cn(
                  "h-auto min-h-32 w-full flex-col items-stretch justify-start gap-2 rounded-xl p-4 text-left whitespace-normal",
                  isSelected
                    ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
                    : "border-border bg-card hover:bg-muted/40",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold tracking-tight text-foreground">
                    {style.label}
                  </span>
                  <RadioIndicator isSelected={isSelected} />
                </span>
                <span className="text-xs leading-relaxed font-normal text-muted-foreground">
                  {style.description}
                </span>
              </Button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Model AI
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Model yang dipakai untuk membuat email konsumen dan telaah balasan.
          </p>
        </div>

        <div
          className="grid grid-cols-1 gap-2.5"
          role="radiogroup"
          aria-label="Model AI"
        >
          {TEXT_MODELS.map((model) => {
            const isSelected = selectedModel === model.id;
            return (
              <Button
                key={model.id}
                type="button"
                variant="outline"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedModel(model.id)}
                className={cn(
                  "h-auto min-h-16 w-full items-center justify-between gap-3 rounded-xl p-4 text-left whitespace-normal",
                  isSelected
                    ? "border-primary/50 bg-primary/5 hover:bg-primary/5"
                    : "border-border bg-card hover:bg-muted/40",
                )}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                      {model.name}
                    </span>
                    <span className="shrink-0 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {model.provider === "gemini" ? "Gemini" : "OpenAI"}
                    </span>
                  </span>
                  <span className="text-xs leading-relaxed font-normal text-muted-foreground">
                    {model.description}
                  </span>
                </span>
                <RadioIndicator isSelected={isSelected} />
              </Button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
