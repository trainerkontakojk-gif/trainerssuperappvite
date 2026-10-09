import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SeriesControls({
  showTotal,
  canShowTotal,
  onToggleTotal,
  parameterLabels,
  hiddenParams,
  canActivateMore,
  limitReached,
  onToggleParameter,
  showPredictionToggle,
  showPrediction,
  onTogglePrediction,
}: {
  showTotal: boolean;
  canShowTotal: boolean;
  onToggleTotal: () => void;
  parameterLabels: string[];
  hiddenParams: Set<string>;
  canActivateMore: boolean;
  limitReached: boolean;
  onToggleParameter: (label: string) => void;
  showPredictionToggle: boolean;
  showPrediction: boolean;
  onTogglePrediction: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Seri grafik yang ditampilkan"
          className="flex flex-wrap items-center gap-2"
        >
          <Button
            type="button"
            variant={showTotal ? "default" : "outline"}
            size="lg"
            onClick={onToggleTotal}
            aria-pressed={showTotal}
            disabled={!canShowTotal}
            className="h-[44px]"
          >
            Total temuan
          </Button>
          {parameterLabels.map((label) => {
            const isHidden = hiddenParams.has(label);
            return (
              <Button
                key={label}
                type="button"
                variant={isHidden ? "outline" : "default"}
                size="lg"
                disabled={isHidden && !canActivateMore}
                onClick={() => onToggleParameter(label)}
                aria-pressed={!isHidden}
                className="h-[44px] max-w-48"
              >
                <span className="truncate">{label}</span>
              </Button>
            );
          })}
        </div>

        {showPredictionToggle ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onTogglePrediction}
            aria-pressed={showPrediction}
            className="h-[44px] w-full sm:w-auto"
          >
            {showPrediction ? (
              <EyeOff data-icon="inline-start" aria-hidden="true" />
            ) : (
              <Eye data-icon="inline-start" aria-hidden="true" />
            )}
            {showPrediction ? "Sembunyikan prediksi" : "Tampilkan prediksi"}
          </Button>
        ) : null}
      </div>

      {limitReached ? (
        <p className="text-[12px] leading-5 text-muted-foreground">
          Maksimal 2 data tampil. Nonaktifkan salah satu terlebih dahulu.
        </p>
      ) : null}
    </div>
  );
}
