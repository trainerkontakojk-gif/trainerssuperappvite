import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import {
  X,
  Phone,
  MessageCircle,
  Mail,
} from "lucide-react";
import {
  type UnifiedHistoryEntry,
  getModuleBadgeClasses,
  getScoreColor,
  formatDuration,
  formatDate,
} from "../utils/formatting";
import { ReviewStatusBadge } from "./ReviewStatusBadge";
import { KetikReviewPanel } from "./KetikReviewPanel";
import { PdktEvaluationPanel } from "./PdktEvaluationPanel";
import { TelefunReviewPanel } from "./TelefunReviewPanel";

interface ReviewDetailModalProps {
  entry: UnifiedHistoryEntry;
  onClose: () => void;
}

function Metadata({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-foreground">
        {value ?? "Tidak tersedia"}
      </dd>
    </div>
  );
}

export function ReviewDetailModal({ entry, onClose }: ReviewDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const getFocusableElements = () => {
      const root = dialogRef.current;
      if (!root) return [] as HTMLElement[];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!activeElement || !dialogRef.current?.contains(activeElement) || activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (!activeElement || !dialogRef.current?.contains(activeElement) || activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      role="presentation"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
      />
      <motion.div
        ref={dialogRef}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-detail-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-foreground/[0.02] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {entry.module === "ketik" && (
              <MessageCircle size={16} className="text-module-ketik shrink-0" />
            )}
            {entry.module === "pdkt" && (
              <Mail size={16} className="text-module-pdkt shrink-0" />
            )}
            {entry.module === "telefun" && (
              <Phone size={16} className="text-module-telefun shrink-0" />
            )}
            <div className="min-w-0">
              <h2 id="review-detail-title" className="text-sm font-black tracking-tight truncate">
                {entry.scenario_title}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] ${getModuleBadgeClasses(entry.module)}`}
                >
                  {entry.module}
                </span>
                <ReviewStatusBadge status={entry.review_status} />
                <span className="text-[10px] text-muted-foreground">
                  {entry.user_email || "-"}
                </span>
              </div>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            aria-label="Tutup detail monitoring"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-foreground/5 flex items-center justify-center transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — Each panel now renders its own content (transcript + AI assessment) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <dl
            className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Informasi konsumen"
          >
            <Metadata label="Nama konsumen" value={entry.consumer_name} />
            {entry.module === "ketik" && (
              <>
                <Metadata label="Telepon" value={entry.consumer_phone} />
                <Metadata label="Kota" value={entry.consumer_city} />
                <Metadata
                  label="Durasi simulasi"
                  value={
                    entry.ketik_session?.simulation_duration != null
                      ? `${entry.ketik_session.simulation_duration} detik`
                      : null
                  }
                />
              </>
            )}
            {entry.module === "pdkt" && (
              <>
                <Metadata label="Tipe konsumen" value={entry.consumer_type} />
                <Metadata label="Penerima" value={entry.recipient} />
                <Metadata label="Kontak" value={entry.contact} />
              </>
            )}
            {entry.module === "telefun" && (
              <>
                <Metadata label="Telepon" value={entry.consumer_phone} />
                <Metadata label="Kota" value={entry.consumer_city} />
                <Metadata
                  label="Tipe / Gender"
                  value={
                    [entry.consumer_type, entry.consumer_gender]
                      .filter(Boolean)
                      .join(" · ") || null
                  }
                />
              </>
            )}
          </dl>
          {entry.module === "ketik" && (
            <KetikReviewPanel
              entryId={entry.id}
              messages={Array.isArray(entry.history) ? entry.history : undefined}
            />
          )}
          {entry.module === "pdkt" && (
            <PdktEvaluationPanel entryId={entry.id} />
          )}
          {entry.module === "telefun" && (
            <TelefunReviewPanel entryId={entry.id} />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-foreground/[0.02] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                Durasi
              </span>
              <span className="text-lg font-black">
                {formatDuration(entry.duration_seconds)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                Skor
              </span>
              <span
                className={`text-lg font-black ${getScoreColor(entry.score, entry.module === "telefun" ? 10 : 100)}`}
              >
                {entry.score !== null ? entry.score : "-"}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                Waktu
              </span>
              <span className="text-xs font-bold text-muted-foreground">
                {formatDate(entry.created_at)}
              </span>
            </div>
          </div>
          <button
            aria-label="Tutup detail monitoring"
            onClick={onClose}
            className="px-5 py-2 bg-foreground text-background rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
          >
            Tutup
          </button>
        </div>
      </motion.div>
    </div>
  );
}
