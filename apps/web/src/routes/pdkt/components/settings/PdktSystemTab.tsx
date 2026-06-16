import { Edit2, Sparkles, Settings, Check } from "lucide-react";
import { TEXT_MODELS } from "../../pdktSettings";

export interface PdktSystemTabProps {
  writingStyleMode: "realistic" | "training";
  setWritingStyleMode: React.Dispatch<React.SetStateAction<"realistic" | "training">>;
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
      <div className="bg-primary/5 border-l-2 border-primary p-4 rounded-r-xl relative overflow-hidden group backdrop-blur-sm">
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
              Pilih model AI dan mode penulisan yang akan menggerakkan simulasi email ini.
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Realistic Mode */}
          <div
            onClick={() => setWritingStyleMode("realistic")}
            className={`cursor-pointer p-5 rounded-xl border transition-all relative overflow-hidden group ${
              writingStyleMode === "realistic"
                ? "bg-card border-primary shadow-sm"
                : "bg-card/40 border-border/40 hover:border-primary/30 hover:bg-card/70"
            }`}
          >
            {writingStyleMode === "realistic" && (
              <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
            )}
            <div className="flex justify-between items-start">
              <h4 className="font-semibold text-sm tracking-tight flex items-center gap-2 text-foreground">
                <div
                  className={`w-2 h-2 rounded-full ${
                    writingStyleMode === "realistic"
                      ? "bg-primary animate-pulse"
                      : "bg-foreground/20"
                  }`}
                />
                Realistis
              </h4>
              {writingStyleMode === "realistic" && (
                <div className="bg-primary/10 text-primary p-1 rounded-md backdrop-blur-md">
                  <Check className="w-3.5 h-3.5 stroke-[3px]" />
                </div>
              )}
            </div>
            <p className="text-xs font-medium leading-relaxed text-muted-foreground mt-2">
              Email mengandung typo, capslock, dan bahasa informal/kurang berpendidikan untuk simulasi yang lebih nyata.
            </p>
          </div>

          {/* Latihan Mode */}
          <div
            onClick={() => setWritingStyleMode("training")}
            className={`cursor-pointer p-5 rounded-xl border transition-all relative overflow-hidden group ${
              writingStyleMode === "training"
                ? "bg-card border-primary shadow-sm"
                : "bg-card/40 border-border/40 hover:border-primary/30 hover:bg-card/70"
            }`}
          >
            {writingStyleMode === "training" && (
              <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
            )}
            <div className="flex justify-between items-start">
              <h4 className="font-semibold text-sm tracking-tight flex items-center gap-2 text-foreground">
                <div
                  className={`w-2 h-2 rounded-full ${
                    writingStyleMode === "training" ? "bg-primary" : "bg-foreground/20"
                  }`}
                />
                Latihan
              </h4>
              {writingStyleMode === "training" && (
                <div className="bg-primary/10 text-primary p-1 rounded-md backdrop-blur-md">
                  <Check className="w-3.5 h-3.5 stroke-[3px]" />
                </div>
              )}
            </div>
            <p className="text-xs font-medium leading-relaxed text-muted-foreground mt-2">
              Email menggunakan bahasa yang rapi, terstruktur, dan formal untuk tahap awal pelatihan.
            </p>
          </div>
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

        <div className="grid grid-cols-1 gap-2.5">
          {TEXT_MODELS.map((model) => {
            const isSelected = selectedModel === model.id;
            const providerLabel = model.provider;
            return (
              <div
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={`cursor-pointer p-4 rounded-xl border transition-all flex items-center justify-between gap-4 group relative overflow-hidden ${
                  isSelected
                    ? "bg-card border-primary shadow-sm opacity-100"
                    : "bg-card/30 border-border/40 opacity-60 hover:opacity-100 hover:bg-card/50"
                }`}
              >
                {isSelected && (
                  <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="text-sm font-bold text-foreground tracking-tight truncate">
                      {model.name}
                    </h4>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${
                        providerLabel === "openrouter"
                          ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                          : providerLabel === "deepseek"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      }`}
                    >
                      {providerLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {model.description}
                  </p>
                </div>
                {isSelected && (
                  <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 text-primary">
                    <Check className="w-4 h-4 stroke-[3px]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
