import { motion } from "framer-motion";
import { Rocket, AlertTriangle } from "lucide-react";
import type { RuleVersion, QARuleIndicator } from "@trainers/types";
import { SERVICE_LABELS, formatPeriodLabel } from "../constants";
import {
  getIndicatorCategoryTotals,
  hasValidWeightedCategoryTotals,
} from "../utils";

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
  const sortedPeriods = periods
    ? [...periods].sort((a, b) => b.year - a.year || b.month - a.month)
    : [];
  const isSlik = previewVersion.service_type === "slik";
  const parentCount = new Set(
    draftIndicators.map(
      (indicator) => indicator.parameter_group || indicator.name,
    ),
  ).size;
  const categoryTotals = getIndicatorCategoryTotals(draftIndicators);
  const invalidSlikWeights =
    isSlik && !hasValidWeightedCategoryTotals(draftIndicators);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-background/80 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface w-full max-w-lg rounded-2xl p-8 border border-border space-y-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="w-14 h-14 bg-background border border-border rounded-xl flex items-center justify-center mx-auto mb-4">
          <Rocket className="w-6 h-6 text-muted-foreground" />
        </div>
        <h2 className="font-outfit text-xl font-bold text-foreground text-center">
          Preview & Publish
        </h2>

        <div className="space-y-1.5 mb-6">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1 block">
            Target Periode Efektif <span className="text-red-500">*</span>
          </label>
          <select
            value={publishPeriodId}
            onChange={(e) => setPublishPeriodId(e.target.value)}
            className="w-full h-10 bg-transparent border border-border rounded-lg px-3 text-sm outline-none focus:border-foreground text-foreground cursor-pointer"
          >
            {sortedPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {formatPeriodLabel(p.month, p.year)}
              </option>
            ))}
          </select>
        </div>

        {/* Preview Info */}
        <div className="space-y-3 border border-border rounded-xl p-4 bg-background/30">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Service:</span>
            <span className="font-semibold text-foreground">
              {SERVICE_LABELS[previewVersion.service_type]}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Version:</span>
            <span className="font-semibold text-foreground">
              v{getPreviewVersionNumber()}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">
              Scoring Mode:
            </span>
            <span className="font-semibold text-foreground uppercase">
              {previewVersion.scoring_mode}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">
              Total Parameter:
            </span>
            <span className="font-semibold text-foreground">
              {isSlik
                ? `${parentCount} parameter · ${draftIndicators.length} item`
                : draftIndicators.length}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">
              Critical Weight:
            </span>
            <span className="font-semibold text-foreground">
              {Math.round(previewVersion.critical_weight * 100)}%
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">
              Non-Critical Weight:
            </span>
            <span className="font-semibold text-foreground">
              {Math.round(previewVersion.non_critical_weight * 100)}%
            </span>
          </div>
        </div>

        {/* Indicator List */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
            Parameter
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1 border border-border rounded-xl p-3 bg-background/20">
            {draftIndicators.map((ind) => (
              <div
                key={ind.id}
                className="flex justify-between gap-4 text-xs py-1.5 border-b border-border/50 last:border-0"
              >
                <span className="min-w-0 font-medium text-foreground/85">
                  {ind.parameter_group && (
                    <span className="block text-[10px] text-muted-foreground">
                      {ind.parameter_group}
                    </span>
                  )}
                  {ind.name}
                </span>
                <span className="shrink-0 text-right font-semibold text-muted-foreground">
                  {Math.round(ind.bobot * 100)}%
                  {isSlik && ind.category !== "none" && (
                    <span className="block text-[10px] font-medium">
                      akhir{" "}
                      {Math.round(
                        ind.bobot *
                          (ind.category === "critical"
                            ? previewVersion.critical_weight
                            : previewVersion.non_critical_weight) *
                          100,
                      )}
                      %
                    </span>
                  )}
                  {!isSlik &&
                    ` (${ind.category === "none" ? "semua" : ind.category.replace("_", " ")})`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Change Reason */}
        {previewVersion.created_from_version_id !== null && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1 block">
              Alasan Revisi <span className="text-red-500">*</span>
            </label>
            <textarea
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Jelaskan mengapa parameter ini direvisi..."
              className="w-full bg-transparent border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-foreground text-foreground resize-none h-20"
            />
          </div>
        )}

        <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] font-medium text-amber-600/90 leading-relaxed uppercase tracking-wider">
            Setelah dipublish, rule ini tidak dapat diubah lagi (Immutable).
            Hanya versi published di periode target yang sama yang akan
            digantikan.
          </p>
        </div>

        {invalidSlikWeights && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-xs font-semibold text-red-600">
              Total bobot per kategori harus tepat 100% sebelum dipublish.
            </p>
            <p className="mt-1 text-xs text-red-600/80">
              Non Critical {Math.round(categoryTotals.nonCritical * 100)}% ·
              Critical {Math.round(categoryTotals.critical * 100)}%
            </p>
          </div>
        )}

        {/* Confirmation Checkbox */}
        <label className="flex items-center gap-3 p-4 rounded-xl border border-border bg-transparent cursor-pointer">
          <input
            type="checkbox"
            checked={publishConfirmed}
            onChange={(e) => setPublishConfirmed(e.target.checked)}
            className="w-4 h-4 accent-foreground rounded border-border"
          />
          <span className="text-xs font-semibold text-foreground">
            Saya telah meninjau parameter
            {isSlik ? ", sub-parameter," : ""} dan bobot di atas
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <button
            onClick={onPublish}
            disabled={
              isPublishing ||
              !publishConfirmed ||
              invalidSlikWeights ||
              (previewVersion.created_from_version_id !== null &&
                !changeReason.trim())
            }
            className="w-full py-3 bg-foreground hover:opacity-90 disabled:opacity-50 text-background rounded-xl text-xs font-semibold uppercase tracking-wide transition-all"
          >
            {isPublishing ? "Mempublish..." : "Ya, Publish Sekarang"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 bg-transparent border border-border hover:bg-muted text-muted-foreground rounded-xl text-xs font-semibold uppercase tracking-wide transition"
          >
            Batal
          </button>
        </div>
      </motion.div>
    </div>
  );
}
