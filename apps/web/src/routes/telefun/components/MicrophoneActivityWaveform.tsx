export type MicrophoneWaveformTone = "silent" | "normal" | "warning" | "danger";

interface MicrophoneActivityWaveformProps {
  bars: number[];
  active: boolean;
  tone: MicrophoneWaveformTone;
}

const TONE_CLASSES: Record<MicrophoneWaveformTone, string> = {
  silent: "bg-muted-foreground/30",
  normal: "bg-module-telefun/70",
  warning: "bg-chart-amber/70",
  danger: "bg-destructive/70",
};

export function MicrophoneActivityWaveform({
  bars = [],
  active,
  tone,
}: MicrophoneActivityWaveformProps) {
  const safeBars = bars || [];
  const visibleBars =
    safeBars.length > 0 ? safeBars : Array.from({ length: 24 }, () => 4);

  return (
    <div
      data-testid="telefun-mic-waveform"
      aria-hidden="true"
      className="mt-2 flex h-6 w-full items-center gap-1 overflow-hidden rounded-md"
    >
      {visibleBars.map((value, index) => (
        <span
          data-testid="telefun-mic-waveform-bar"
          key={index}
          className={`block w-1 rounded-full transition-[height,opacity] duration-100 motion-reduce:transition-none ${
            active ? TONE_CLASSES[tone] : "bg-muted-foreground/20"
          }`}
          style={{
            height: `${Math.max(3, Math.min(24, value))}px`,
            opacity: active ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}
