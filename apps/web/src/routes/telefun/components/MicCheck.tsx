import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "cn";

export type MicCheckStatus =
  "asking" | "ready" | "denied" | "unavailable" | "unsupported";

const BARS = 6;
const DEVICE_STORAGE_KEY = "telefun.microphoneDeviceId";

function rememberedDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Cek mikrofon sebelum memanggil. Hanya mendengarkan level suara di perangkat
 * ini; tidak merekam dan tidak mengirim apa pun. Mikrofon dilepas lagi saat
 * dialog ditutup, sehingga panggilan membuka aliran suaranya sendiri.
 */
export function MicCheck({
  onStatusChange,
  onDeviceChange,
}: {
  onStatusChange: (status: MicCheckStatus) => void;
  onDeviceChange: (deviceId: string | undefined) => void;
}) {
  const [status, setStatus] = useState<MicCheckStatus>("asking");
  const [level, setLevel] = useState(0);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const labelId = useId();
  const switchDeviceRef = useRef<(id: string) => void>(() => {});
  const onDeviceChangeRef = useRef(onDeviceChange);
  useEffect(() => {
    onDeviceChangeRef.current = onDeviceChange;
  }, [onDeviceChange]);
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
    let generation = 0;
    let currentDeviceId: string | undefined;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let frame = 0;
    const release = () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      void context?.close().catch(() => {});
      context = null;
    };
    const enumerate = async () => {
      try {
        return (await navigator.mediaDevices.enumerateDevices()).filter(
          (device) => device.kind === "audioinput" && device.deviceId,
        );
      } catch {
        // Enumeration is optional; the actual track still identifies the mic.
        return [];
      }
    };

    const start = async (requestedId?: string, restore = false) => {
      const run = ++generation;
      const stale = () => cancelled || run !== generation;
      release();
      currentDeviceId = undefined;
      setHeard(false);
      setLevel(0);
      update("asking");
      onDeviceChangeRef.current(undefined);
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
        update("unsupported");
        return;
      }
      try {
        const opened = await navigator.mediaDevices.getUserMedia({
          audio: requestedId ? { deviceId: { exact: requestedId } } : true,
        });
        if (stale()) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;
        const available = await enumerate();
        if (stale()) return;
        setDevices(available);
        const saved = restore ? rememberedDeviceId() : null;
        if (
          saved &&
          saved !== stream.getAudioTracks()[0]?.getSettings().deviceId &&
          available.some((device) => device.deviceId === saved)
        ) {
          // The only fallback is visible here, before the call: keep the
          // browser-default check stream if the remembered headset disappeared.
          try {
            const restored = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: saved } },
            });
            if (stale()) {
              restored.getTracks().forEach((track) => track.stop());
              return;
            }
            stream.getTracks().forEach((track) => track.stop());
            stream = restored;
          } catch (error) {
            if (stale()) return;
            if (
              !(error instanceof DOMException) ||
              !["NotFoundError", "OverconstrainedError"].includes(error.name)
            )
              throw error;
          }
        }
        if (stale()) return;
        const track = stream.getAudioTracks()[0];
        currentDeviceId = track?.getSettings().deviceId || undefined;
        setDeviceId(currentDeviceId ?? "");
        setDeviceLabel(track?.label || null);
        onDeviceChangeRef.current(currentDeviceId);
        // Only a choice made in the select is remembered; a default fallback
        // while the headset is unplugged must not overwrite it.
        try {
          if (requestedId && currentDeviceId)
            localStorage.setItem(DEVICE_STORAGE_KEY, currentDeviceId);
        } catch {
          // Storage can be disabled; the current check/call still works.
        }

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
        update("ready");
      } catch (error) {
        if (!stale()) {
          release();
          onDeviceChangeRef.current(undefined);
          update(
            error instanceof DOMException && error.name === "NotAllowedError"
              ? "denied"
              : "unavailable",
          );
        }
      }
    };

    switchDeviceRef.current = (id) => {
      void start(id);
    };
    const refreshDevices = async () => {
      const run = generation;
      const available = await enumerate();
      if (cancelled || run !== generation) return;
      setDevices(available);
      if (
        available.length > 0 &&
        currentDeviceId &&
        !available.some((device) => device.deviceId === currentDeviceId)
      )
        void start();
    };
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    void start(undefined, true);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        refreshDevices,
      );
      release();
    };
  }, [attempt, update]);

  const litBars = Math.round(level * BARS);

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-xs font-semibold text-fg2">
        Mikrofon
      </span>
      {status === "denied" ||
      status === "unavailable" ||
      status === "unsupported" ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-1.5 rounded-lg border border-destructive bg-destructive/10 px-3.5 py-3"
        >
          <strong className="text-[13px] font-semibold text-foreground">
            {status === "denied"
              ? "Mikrofon belum diizinkan"
              : status === "unavailable"
                ? "Mikrofon tidak tersedia"
                : "Browser ini tidak mendukung mikrofon"}
          </strong>
          <p className="text-[13px] leading-5 text-fg2">
            {status === "denied"
              ? 'Klik ikon gembok di samping alamat situs, pilih "Izinkan" untuk mikrofon, lalu klik Coba lagi.'
              : status === "unavailable"
                ? "Periksa headset, lalu klik Coba lagi untuk mengecek mikrofon."
                : "Buka Telefun di Chrome, Edge, atau Safari versi terbaru."}
          </p>
          {status !== "unsupported" && (
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
          <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3">
            {devices.length > 1 ? (
              <select
                aria-labelledby={labelId}
                value={deviceId}
                disabled={status === "asking"}
                onChange={(event) =>
                  switchDeviceRef.current(event.target.value)
                }
                className="h-[44px] min-h-11 min-w-0 flex-1 truncate rounded-md border-0 bg-background text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {!devices.some((device) => device.deviceId === deviceId) && (
                  <option value={deviceId}>
                    {deviceLabel ?? "Mikrofon bawaan"}
                  </option>
                )}
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Mikrofon ${index + 1}`}
                  </option>
                ))}
              </select>
            ) : (
              <span className="truncate text-[13px] text-foreground">
                {status === "asking"
                  ? "Meminta izin mikrofon…"
                  : (deviceLabel ?? "Mikrofon bawaan")}
              </span>
            )}
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
