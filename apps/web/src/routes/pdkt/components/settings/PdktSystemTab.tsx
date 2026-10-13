import { cn } from "cn";
import { Button } from "../../../../components/ui/button";
import { TEXT_MODELS } from "../../pdktSettings";
import { PdktSwitch } from "./PdktSwitch";

export interface PdktSystemTabProps {
  writingStyleMode: "realistic" | "training";
  setWritingStyleMode: React.Dispatch<
    React.SetStateAction<"realistic" | "training">
  >;
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  enableImageGeneration: boolean;
  setEnableImageGeneration: (value: boolean) => void;
}

const writingStyles = [
  {
    id: "realistic" as const,
    label: "Realistis",
    description:
      "Seperti email sungguhan: ada salah ketik, huruf kapital, dan bahasa tidak baku.",
    sample: "sy udh LUNAS dr tgl 2 tp msh d tagih trs!!",
  },
  {
    id: "training" as const,
    label: "Rapi",
    description:
      "Bahasa baku dan tertata. Cocok untuk peserta yang baru mulai.",
    sample: "Saya sudah melunasi pinjaman sejak 2 September.",
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
  enableImageGeneration,
  setEnableImageGeneration,
}: PdktSystemTabProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl font-bold tracking-tight text-foreground">
          Gaya &amp; AI
        </h3>
        <p className="text-[13px] leading-5 text-foreground/80">
          Atur gaya tulisan konsumen dan AI yang membuat email serta menilai
          balasan.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h4 className="text-[15px] font-semibold text-foreground">
          Gaya tulisan konsumen
        </h4>

        <div
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          role="radiogroup"
          aria-label="Gaya tulisan konsumen"
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
                <span className="text-xs leading-relaxed font-normal text-foreground/80">
                  {style.description}
                </span>
                <span className="rounded-md bg-muted px-2.5 py-2 text-xs leading-relaxed font-normal italic text-foreground/80">
                  {style.sample}
                </span>
              </Button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h4 className="text-[15px] font-semibold text-foreground">
            Model AI
          </h4>
          <p className="mt-1 text-[13px] leading-5 text-foreground/80">
            Model yang dipakai untuk membuat email konsumen dan menelaah
            balasan.
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
      <section className="flex items-center gap-3.5 rounded-xl border border-border p-4">
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="font-semibold text-foreground">Gambar lampiran</span>
          <span className="text-xs leading-[18px] text-muted-foreground">
            AI membuat gambar pendukung, seperti bukti transfer, bila kasusnya
            perlu. Biaya per sesi jadi lebih tinggi.
          </span>
        </span>
        <PdktSwitch
          label="Gambar lampiran"
          checked={enableImageGeneration}
          onCheckedChange={setEnableImageGeneration}
        />
      </section>
    </div>
  );
}
