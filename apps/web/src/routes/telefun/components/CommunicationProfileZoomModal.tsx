import React, { useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Maximize2, TrendingUp, TrendingDown, Gauge } from "lucide-react";
import type {
  TelefunCommunicationProfile,
  CommunicationMetric,
} from "@trainers/types";
import { VoiceRadarChart } from "./VoiceRadarChart";

interface CommunicationProfileZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: TelefunCommunicationProfile | null;
}

const MODE_ICONS: Record<string, React.ReactNode> = {
  higher_better: <TrendingUp className="h-4 w-4 text-emerald-500" />,
  lower_better: <TrendingDown className="h-4 w-4 text-amber-500" />,
  optimal_range: <Gauge className="h-4 w-4 text-blue-500" />,
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

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      closeRef.current?.focus();
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [isOpen, handleEsc]);

  if (!isOpen || !profile) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-label="Perbesar diagram profil komunikasi"
          aria-modal="true"
          className="fixed inset-0 z-[260] flex items-center justify-center p-4 md:p-8"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/90 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-[980px] max-h-[90vh] overflow-y-auto bg-card border border-border rounded-[2.5rem] shadow-2xl p-6 md:p-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Profil Komunikasi
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Semakin sesuai dengan area target, semakin baik
                </p>
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                className="p-2 hover:bg-foreground/5 rounded-full transition-colors border border-border"
                aria-label="Tutup modal"
              >
                <X className="w-5 h-5 text-muted-foreground" />
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
                    semakin tinggi skor, semakin baik.
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
                    <strong className="text-foreground">Fillers:</strong> skor
                    makin tinggi berarti kata pengisi makin sedikit. Detail
                    tetap menampilkan jumlah filler mentah.
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
