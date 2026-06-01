import React from "react";
import { Sparkles, Loader2 } from "lucide-react";

interface ScenarioAIGeneratorProps {
  onGenerate: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
}

export function ScenarioAIGenerator({
  onGenerate,
  isGenerating,
  canGenerate,
}: ScenarioAIGeneratorProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
        Template Email (Opsional)
      </label>
      <button
        onClick={onGenerate}
        disabled={isGenerating || !canGenerate}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/10 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 cursor-pointer"
      >
        {isGenerating ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        <span>
          {isGenerating ? "Generating..." : "Generate"}
        </span>
      </button>
    </div>
  );
}
