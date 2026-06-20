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
    <div className="flex items-center gap-3">
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Template Email (Opsional)
      </label>
      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating || !canGenerate}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/10 rounded-md text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
      >
        {isGenerating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        <span>
          {isGenerating ? "Generating..." : "Generate"}
        </span>
      </button>
    </div>
  );
}
