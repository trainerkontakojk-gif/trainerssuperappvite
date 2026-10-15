import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "cn";

export type MicCheckStatus = "asking" | "ready" | "denied" | "unsupported";

const BARS = 6;

/**
 * Cek mikrofon sebelum memanggil. Hanya mendengarkan level suara di perangkat
 * ini; tidak merekam dan tidak mengirim apa pun. Mikrofon dilepas lagi saat
 * dialog ditutup, sehingga panggilan membuka aliran suaranya sendiri.
 */
export function MicCheck({
  onStatusChange,
}: {
  onStatusChange: (status: MicCheckStatus) => void;
}) {
  const [status, setStatus] = useState<MicCheckStatus>("asking");
  const [level, setLevel] = useState(0);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [heard, setHeard] = useState(false);
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const update = useCallback((next: MicCheckStatus) => {
    setStatus(next);
    onStatusChangeRef.current(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let frame = 0;
    setHeard(false);
    update("asking");

    const start = async () => {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
        update("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (!cancelled) update("denied");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setDeviceLabel(stream.getAudioTracks()[0]?.label || null);
      update("ready");

      context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples)
          peak = Math.max(peak, Math.abs(sample - 128));
        // Dibulatkan ke tingkat meter supaya dialog tidak dirender ulang tiap frame.
        const next = Math.round(Math.min(1, peak / 64) * BARS) / BARS;
        setLevel(next);
        if (next > 0.1) setHeard(true);
        frame = requestAnimationFrame(tick);
      };
      tick();
    };

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => {});
    };
  }, [attempt, update]);

  const litBars = Math.round(level * BARS);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-fg2">Mikrofon</span>
      {status === "denied" || status === "unsupported" ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-1.5 rounded-lg border border-destructive bg-destructive/10 px-3.5 py-3"
        >
          <strong className="text-[13px] font-semibold text-foreground">
            {status === "denied"
              ? "Mikrofon belum diizinkan"
              : "Browser ini tidak mendukung mikrofon"}
          </strong>
          <p className="text-[13px] leading-5 text-fg2">
            {status === "denied"
              ? 'Klik ikon gembok di samping alamat situs, pilih "Izinkan" untuk mikrofon, lalu klik Coba lagi.'
              : "Buka Telefun di Chrome, Edge, atau Safari versi terbaru."}
          </p>
          {status === "denied" && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="min-h-11 rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Coba lagi
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3">
            <span className="truncate text-[13px] text-foreground">
              {status === "asking"
                ? "Meminta izin mikrofon…"
                : (deviceLabel ?? "Mikrofon bawaan")}
            </span>
            <span
              aria-hidden="true"
              className="flex h-4 shrink-0 items-end gap-0.5"
            >
              {Array.from({ length: BARS }, (_, index) => (
                <i
                  key={index}
                  className={cn(
                    "block w-1 rounded-[1px]",
                    index < litBars ? "bg-chart-green" : "bg-surface-sunken",
                  )}
                  style={{ height: `${30 + index * 12}%` }}
                />
              ))}
            </span>
          </div>
          {status === "ready" && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 text-xs text-fg2"
            >
              {heard ? (
                <>
                  <Check
                    aria-hidden="true"
                    className="size-3.5 text-chart-green"
                  />
                  Suara Anda terdengar.
                </>
              ) : (
                "Mikrofon siap. Bicaralah sebentar untuk mencoba."
              )}
            </span>
          )}
        </>
      )}
    </div>
  );
}
