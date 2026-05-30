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
    <div className="space-y-8 mt-4">
      <div className="bg-card/40 p-8 rounded-xl border border-border/50 backdrop-blur-md">
        <div className="flex items-start gap-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Settings className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-xl tracking-tight">
              Pengaturan Sistem
            </h3>
            <p className="text-sm text-muted-foreground mt-1 font-medium leading-relaxed">
              Pilih model AI dan mode penulisan yang akan menggerakkan simulasi email ini.
            </p>
          </div>
        </div>
      </div>

      {/* Writing Style Mode */}
      <div className="space-y-4">
        <div className="flex items-center gap-4 mb-2 ml-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Edit2 className="w-5 h-5 text-primary" />
          </div>
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Mode Penulisan
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => setWritingStyleMode("realistic")}
            className={`cursor-pointer p-6 rounded-xl border transition-all relative overflow-hidden group ${
              writingStyleMode === "realistic"
                ? "bg-primary border-primary/30 shadow-xl shadow-primary/10"
                : "bg-card/40 border-border/50 hover:border-primary/20 hover:bg-card/60"
            }`}
          >
            {writingStyleMode === "realistic" && (
              <div className="absolute inset-y-0 left-0 w-1 bg-primary-foreground/50" />
            )}
            <div className="flex justify-between items-start mb-4">
              <h4
                className={`font-semibold text-lg tracking-tight flex items-center gap-3 ${
                  writingStyleMode === "realistic" ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    writingStyleMode === "realistic"
                      ? "bg-primary-foreground animate-pulse"
                      : "bg-foreground/20"
                  }`}
                />
                Realistis
              </h4>
              {writingStyleMode === "realistic" && (
                <div className="bg-primary-foreground/20 text-primary-foreground p-1.5 rounded-xl backdrop-blur-md">
                  <Check className="w-4 h-4 stroke-[3px]" />
                </div>
              )}
            </div>
            <p
              className={`text-xs font-medium leading-relaxed ${
                writingStyleMode === "realistic" ? "text-primary-foreground/60" : "text-muted-foreground"
              }`}
            >
              Email mengandung typo, capslock, dan bahasa informal/kurang berpendidikan untuk simulasi yang lebih nyata.
            </p>
          </div>

          <div
            onClick={() => setWritingStyleMode("training")}
            className={`cursor-pointer p-6 rounded-xl border transition-all relative overflow-hidden group ${
              writingStyleMode === "training"
                ? "bg-primary border-primary/30 shadow-xl shadow-primary/10"
                : "bg-card/40 border-border/50 hover:border-primary/20 hover:bg-card/60"
            }`}
          >
            {writingStyleMode === "training" && (
              <div className="absolute inset-y-0 left-0 w-1 bg-primary-foreground/50" />
            )}
            <div className="flex justify-between items-start mb-4">
              <h4
                className={`font-semibold text-lg tracking-tight flex items-center gap-3 ${
                  writingStyleMode === "training" ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    writingStyleMode === "training" ? "bg-primary-foreground" : "bg-foreground/20"
                  }`}
                />
                Latihan
              </h4>
              {writingStyleMode === "training" && (
                <div className="bg-primary-foreground/20 text-primary-foreground p-1.5 rounded-xl backdrop-blur-md">
                  <Check className="w-4 h-4 stroke-[3px]" />
                </div>
              )}
            </div>
            <p
              className={`text-xs font-medium leading-relaxed ${
                writingStyleMode === "training" ? "text-primary-foreground/60" : "text-muted-foreground"
              }`}
            >
              Email menggunakan bahasa yang rapi, terstruktur, dan formal untuk tahap awal pelatihan.
            </p>
          </div>
        </div>
      </div>

      {/* Model Selection */}
      <div className="space-y-4">
        <div className="flex items-center gap-4 mb-2 ml-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Model AI
          </h4>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {TEXT_MODELS.map((model) => {
            const isSelected = selectedModel === model.id;
            const isOrModel = model.id.includes("/");
            const providerLabel = isOrModel ? "openrouter" : "gemini";
            return (
              <div
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={`cursor-pointer p-6 rounded-xl border transition-all flex items-center justify-between gap-6 group relative overflow-hidden ${
                  isSelected
                    ? "bg-card border-primary/30 shadow-xl"
                    : "bg-card/20 border-border/50 opacity-40 hover:opacity-100 hover:bg-card/40"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-lg font-semibold text-foreground tracking-tight truncate">
                      {model.name}
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[8px] font-medium uppercase tracking-wide border ${
                        providerLabel === "openrouter"
                          ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                          : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      }`}
                    >
                      {providerLabel}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 font-medium">
                    {model.description}
                  </p>
                </div>
                {isSelected && (
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                    <Check className="w-5 h-5 text-white" />
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
