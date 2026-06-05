export type MicrophoneWaveformTone = "silent" | "normal" | "warning" | "danger";

interface MicrophoneActivityWaveformProps {
  bars: number[];
  active: boolean;
  tone: MicrophoneWaveformTone;
}

const TONE_CLASSES: Record<MicrophoneWaveformTone, string> = {
  silent: "bg-slate-500/30",
  normal: "bg-emerald-500/60",
  warning: "bg-amber-500/60",
  danger: "bg-red-500/60",
};

export function MicrophoneActivityWaveform({
  bars,
  active,
  tone,
}: MicrophoneActivityWaveformProps) {
  const visibleBars = bars.length > 0 ? bars : Array.from({ length: 24 }, () => 4);

  return (
    <div
      data-testid="telefun-mic-waveform"
      aria-hidden="true"
      className="mt-2 flex h-6 w-full items-center gap-[3px] overflow-hidden rounded-md"
    >
      {visibleBars.map((value, index) => (
        <span
          data-testid="telefun-mic-waveform-bar"
          key={index}
          className={`block w-1 rounded-full transition-[height,opacity] duration-100 ${
            active ? TONE_CLASSES[tone] : "bg-slate-500/20"
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
