import React, { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, TrendingUp, TrendingDown, Gauge } from "lucide-react";
import type { TelefunCommunicationProfile } from "@trainers/types";
import { VoiceRadarChart } from "./VoiceRadarChart";

interface CommunicationProfileZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: TelefunCommunicationProfile | null;
}

const MODE_ICONS: Record<string, React.ReactNode> = {
  higher_better: (
    <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
  ),
  lower_better: (
    <TrendingDown className="h-4 w-4 text-amber-500" aria-hidden="true" />
  ),
  optimal_range: <Gauge className="h-4 w-4 text-blue-500" aria-hidden="true" />,
};

const STATUS_COLORS: Record<string, string> = {
  good: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  needs_improvement: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  poor: "bg-red-500/10 text-red-500 border-red-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  good: "Baik",
  needs_improvement: "Cukup",
  poor: "Kurang",
};

export const CommunicationProfileZoomModal: React.FC<
  CommunicationProfileZoomModalProps
> = ({ isOpen, onClose, profile }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    const getFocusableElements = () => {
      if (!dialogRef.current) return [] as HTMLElement[];
      return Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (
        event.shiftKey &&
        (!active || active === first || !dialogRef.current?.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (!active || active === last || !dialogRef.current?.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  if (!isOpen || !profile) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[260] flex items-center justify-center p-4 md:p-8"
          role="presentation"
        >
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            onClick={() => onCloseRef.current()}
            className="absolute inset-0 bg-background/90 backdrop-blur-sm"
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="telefun-profile-title"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, scale: 0.95, y: 20 }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.95, y: 20 }
            }
            transition={shouldReduceMotion ? { duration: 0 } : undefined}
            className="relative w-full max-w-[980px] max-h-[90vh] max-h-dvh overflow-y-auto bg-card border border-border rounded-[2.5rem] shadow-2xl p-6 md:p-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2
                  id="telefun-profile-title"
                  className="text-xl font-bold tracking-tight text-foreground"
                >
                  Profil Komunikasi
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Skor kualitas 0–100, semua aspek skor tinggi = lebih baik
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => onCloseRef.current()}
                className="min-h-11 min-w-11 p-2 hover:bg-foreground/5 rounded-full transition-colors border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label="Tutup modal"
              >
                <X
                  className="w-5 h-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </div>

            <div className="mb-8">
              <VoiceRadarChart profile={profile} compact={false} />
            </div>

            {/* Metric Detail Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
              {profile.metrics.map((metric) => (
                <div
                  key={metric.key}
                  className="rounded-xl border border-border bg-foreground/[0.02] p-4 text-center"
                >
                  <div className="flex items-center justify-center gap-1 mb-2">
                    {MODE_ICONS[metric.evaluationMode] ?? null}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {metric.label}
                    </span>
                  </div>
                  <div className="text-2xl font-black text-foreground mb-1">
                    {metric.displayScore ?? metric.value}
                    <span className="text-xs font-normal text-muted-foreground">
                      /100
                    </span>
                  </div>
                  <span
                    className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[metric.status] || ""}`}
                  >
                    {STATUS_LABELS[metric.status] || metric.status}
                  </span>
                  {metric.explanation && (
                    <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                      {metric.explanation}
                    </p>
                  )}
                  {metric.improvementTip && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 italic">
                      {metric.improvementTip}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* How to read */}
            <div className="rounded-2xl border border-border bg-foreground/[0.02] p-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Cara Membaca
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground">
                      Intonation, Tone, Articulation:
                    </strong>{" "}
                    skor mendekati target ideal adalah yang terbaik, terlalu
                    tinggi pun kurang baik.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Gauge className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground">Speaking Rate:</strong>{" "}
                    ideal di rentang 60-80. Terlalu cepat atau terlalu lambat
                    kurang baik.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingDown className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground">Fillers:</strong> angka
                    rendah = sedikit kata pengisi (baik). Biru di bawah hijau =
                    sesuai target. Jumlah dan contoh kata pengisi dapat dilihat
                    pada kartu di bawah.
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
