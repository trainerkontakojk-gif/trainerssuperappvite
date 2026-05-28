import { motion } from "framer-motion";
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

export function ReviewDetailModal({ entry, onClose }: ReviewDetailModalProps) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl bg-card border border-border/50"
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
              <h2 className="text-sm font-black tracking-tight truncate">
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
                  {entry.user_email}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-foreground/5 flex items-center justify-center transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — Each panel now renders its own content (transcript + AI assessment) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
