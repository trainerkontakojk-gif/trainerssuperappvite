import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../../../../components/ui/button";

interface ScenarioAIGeneratorProps {
  onGenerate: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
  hasGenerated: boolean;
}

export function ScenarioAIGenerator({
  onGenerate,
  isGenerating,
  canGenerate,
  hasGenerated,
}: ScenarioAIGeneratorProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onGenerate}
      disabled={isGenerating || !canGenerate}
      className="shrink-0"
    >
      {isGenerating && (
        <Loader2
          aria-hidden="true"
          data-icon="inline-start"
          className="animate-spin motion-reduce:animate-none"
        />
      )}
      {isGenerating
        ? "Membuat..."
        : hasGenerated
          ? "Buat ulang contoh email"
          : "Buat contoh email"}
    </Button>
  );
}
