import { motion } from "framer-motion";
import { Rocket, AlertTriangle } from "lucide-react";
import type { RuleVersion, QARuleIndicator } from "@trainers/types";
import { SERVICE_LABELS, formatPeriodLabel } from "../constants";

interface PublishPreviewModalProps {
  previewVersion: RuleVersion;
  periods: Array<{ id: string; month: number; year: number }> | undefined;
  draftIndicators: QARuleIndicator[];
  publishPeriodId: string;
  setPublishPeriodId: (id: string) => void;
  changeReason: string;
  setChangeReason: (reason: string) => void;
  publishConfirmed: boolean;
  setPublishConfirmed: (confirmed: boolean) => void;
  isPublishing: boolean;
  getPreviewVersionNumber: () => number;
  onPublish: () => Promise<void>;
  onClose: () => void;
}

export function PublishPreviewModal({
  previewVersion,
  periods,
  draftIndicators,
  publishPeriodId,
  setPublishPeriodId,
  changeReason,
  setChangeReason,
  publishConfirmed,
  setPublishConfirmed,
  isPublishing,
  getPreviewVersionNumber,
  onPublish,
  onClose,
}: PublishPreviewModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-background/80 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full max-w-lg rounded-[2.5rem] p-8 border border-border shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Rocket className="w-10 h-10 text-emerald-600 animate-bounce" />
        </div>
        <h2 className="text-xl font-black text-foreground text-center uppercase tracking-widest">Preview & Publish</h2>

        <div className="space-y-1.5 mb-6">
          <label className="text-[10px] font-black uppercase text-muted-foreground px-1 block">
            Target Periode Efektif <span className="text-red-500">*</span>
          </label>
          <select
            value={publishPeriodId}
            onChange={(e) => setPublishPeriodId(e.target.value)}
            className="w-full px-4 py-4 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none cursor-pointer hover:border-primary transition-all"
          >
            {periods?.map((p) => (
              <option key={p.id} value={p.id}>
                {formatPeriodLabel(p.month, p.year)}
              </option>
            ))}
          </select>
        </div>

        {/* Preview Info */}
        <div className="space-y-3 bg-foreground/5 rounded-2xl p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Service:</span>
            <span className="font-black">{SERVICE_LABELS[previewVersion.service_type]}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Version:</span>
            <span className="font-black">v{getPreviewVersionNumber()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Scoring Mode:</span>
            <span className="font-black uppercase">{previewVersion.scoring_mode}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Total Parameter:</span>
            <span className="font-black">{draftIndicators.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Critical Weight:</span>
            <span className="font-black">{Math.round(previewVersion.critical_weight * 100)}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Non-Critical Weight:</span>
            <span className="font-black">{Math.round(previewVersion.non_critical_weight * 100)}%</span>
          </div>
        </div>

        {/* Indicator List */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase text-muted-foreground">Parameter</p>
          <div className="max-h-40 overflow-y-auto space-y-1 border border-border/50 rounded-xl p-2 bg-foreground/[0.01]">
            {draftIndicators.map((ind) => (
              <div key={ind.id} className="flex justify-between text-xs py-1 border-b border-border last:border-0">
                <span className="font-medium text-foreground/80">{ind.name}</span>
                <span className="font-black text-muted-foreground">
                  {Math.round(ind.bobot * 100)}% ({ind.category === "none" ? "semua" : ind.category.replace("_", " ")})
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Change Reason */}
        {previewVersion.created_from_version_id !== null && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-muted-foreground px-1 block">
              Alasan Revisi <span className="text-red-500">*</span>
            </label>
            <textarea
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Jelaskan mengapa parameter ini direvisi..."
              className="w-full px-4 py-3 rounded-2xl border border-border bg-foreground/5 text-sm font-bold outline-none resize-none h-20"
            />
          </div>
        )}

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase tracking-wider">
            Setelah dipublish, rule ini tidak dapat diubah lagi (Immutable). Versi published sebelumnya akan menjadi superseded.
          </p>
        </div>

        {/* Confirmation Checkbox */}
        <label className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-foreground/5 cursor-pointer">
          <input
            type="checkbox"
            checked={publishConfirmed}
            onChange={(e) => setPublishConfirmed(e.target.checked)}
            className="w-5 h-5 accent-primary rounded"
          />
          <span className="text-xs font-bold text-foreground">Saya telah meninjau parameter dan bobot di atas</span>
        </label>

        <div className="flex flex-col gap-2">
          <button
            onClick={onPublish}
            disabled={isPublishing || !publishConfirmed || (previewVersion.created_from_version_id !== null && !changeReason.trim())}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all"
          >
            {isPublishing ? "Mempublish..." : "Ya, Publish Sekarang"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-4 bg-foreground/5 text-muted-foreground rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-foreground/10 transition"
          >
            Batal
          </button>
        </div>
      </motion.div>
    </div>
  );
}
