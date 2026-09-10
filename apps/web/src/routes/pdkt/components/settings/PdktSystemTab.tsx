import { Edit2, Sparkles, Settings } from "lucide-react";
import { TEXT_MODELS } from "../../pdktSettings";

export interface PdktSystemTabProps {
  writingStyleMode: "realistic" | "training";
  setWritingStyleMode: React.Dispatch<
    React.SetStateAction<"realistic" | "training">
  >;
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
}

export function PdktSystemTab({
  writingStyleMode,
  setWritingStyleMode,
  selectedModel,
  setSelectedModel,
}: PdktSystemTabProps) {
  return (
    <div className="space-y-6 mt-4">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-4 group">
        <div className="absolute top-1/2 -translate-y-1/2 right-4 text-primary/5 group-hover:scale-110 transition-transform pointer-events-none">
          <Settings className="w-24 h-24" />
        </div>
        <div className="relative z-10 max-w-2xl flex gap-4 items-start">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm tracking-tight mb-0.5">
              Pengaturan Sistem
            </h3>
            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
              Pilih model AI dan mode penulisan yang akan menggerakkan simulasi
              email ini.
            </p>
          </div>
        </div>
      </div>

      {/* Writing Style Mode */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Edit2 className="w-4 h-4 text-primary" />
          </div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Mode Penulisan
          </h4>
        </div>

        <div
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          role="radiogroup"
          aria-label="Mode penulisan"
        >
          {/* Realistic Mode */}
          <button
            type="button"
            role="radio"
            aria-checked={writingStyleMode === "realistic"}
            onClick={() => setWritingStyleMode("realistic")}
            className={`w-full cursor-pointer rounded-xl border p-5 text-left transition-all relative overflow-hidden group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
              writingStyleMode === "realistic"
                ? "bg-card border-primary"
                : "bg-card/40 border-border/40 hover:border-primary/30 hover:bg-card/70"
            }`}
          >
            <div className="flex justify-between items-start">
              <h4 className="font-semibold text-sm tracking-tight flex items-center gap-2 text-foreground">
                <div
                  className={`w-2 h-2 rounded-full ${
                    writingStyleMode === "realistic"
                      ? "bg-primary"
                      : "bg-foreground/20"
                  }`}
                />
                Realistis
              </h4>
              <div className="flex items-center shrink-0">
                {writingStyleMode === "realistic" ? (
                  <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border border-border flex items-center justify-center" />
                )}
              </div>
            </div>
            <p className="text-xs font-medium leading-relaxed text-muted-foreground mt-2">
              Email mengandung typo, capslock, dan bahasa informal/kurang
              berpendidikan untuk simulasi yang lebih nyata.
            </p>
          </button>

          {/* Latihan Mode */}
          <button
            type="button"
            role="radio"
            aria-checked={writingStyleMode === "training"}
            onClick={() => setWritingStyleMode("training")}
            className={`w-full cursor-pointer rounded-xl border p-5 text-left transition-all relative overflow-hidden group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
              writingStyleMode === "training"
                ? "bg-card border-primary"
                : "bg-card/40 border-border/40 hover:border-primary/30 hover:bg-card/70"
            }`}
          >
            <div className="flex justify-between items-start">
              <h4 className="font-semibold text-sm tracking-tight flex items-center gap-2 text-foreground">
                <div
                  className={`w-2 h-2 rounded-full ${
                    writingStyleMode === "training"
                      ? "bg-primary"
                      : "bg-foreground/20"
                  }`}
                />
                Latihan
              </h4>
              <div className="flex items-center shrink-0">
                {writingStyleMode === "training" ? (
                  <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border border-border flex items-center justify-center" />
                )}
              </div>
            </div>
            <p className="text-xs font-medium leading-relaxed text-muted-foreground mt-2">
              Email menggunakan bahasa yang rapi, terstruktur, dan formal untuk
              tahap awal pelatihan.
            </p>
          </button>
        </div>
      </div>

      {/* Model Selection */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Model AI
          </h4>
        </div>

        <div
          className="grid grid-cols-1 gap-2.5"
          role="radiogroup"
          aria-label="Model AI"
        >
          {TEXT_MODELS.map((model) => {
            const isSelected = selectedModel === model.id;
            const providerLabel = model.provider;
            return (
              <button
                key={model.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedModel(model.id)}
                className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-all flex items-center justify-between gap-4 group relative overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
                  isSelected
                    ? "bg-card border-primary opacity-100"
                    : "bg-card/30 border-border/40 opacity-85 hover:opacity-100 hover:bg-card/50"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="text-sm font-bold text-foreground tracking-tight truncate">
                      {model.name}
                    </h4>
                    <span className="px-1.5 py-0.5 rounded border text-[11px] font-medium bg-foreground/[0.03] text-foreground/70 border-border">
                      {providerLabel === "gemini" ? "Gemini" : "OpenAI"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {model.description}
                  </p>
                </div>
                <div className="flex items-center shrink-0">
                  {isSelected ? (
                    <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-border flex items-center justify-center" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
