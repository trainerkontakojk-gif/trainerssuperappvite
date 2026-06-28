import React from "react";
import {
  ChevronRight,
  ChevronLeft,
  Paperclip,
  Mail,
  FileText,
} from "lucide-react";
import { PdktScenario } from "@trainers/types";
import { normalizePdktRecipientEmails } from "../pdktDraftNormalizers";

interface ScenarioAdvancedSummaryProps {
  draft: Partial<PdktScenario>;
  isExpanded: boolean;
  onToggle: () => void;
}

function formatRecipientSummary(draft: Partial<PdktScenario>): string {
  const recipientEmails = normalizePdktRecipientEmails(draft.recipientEmails);
  if (recipientEmails.length === 0) return "fallback sistem saja";
  return `${recipientEmails.length} alamat tambahan`;
}

function formatTemplateSummary(draft: Partial<PdktScenario>): string {
  const subject = (draft.sampleEmailTemplate?.subject || "").trim();
  const body = (draft.sampleEmailTemplate?.body || "").trim();
  if (!draft.alwaysUseSampleEmail && !subject && !body) return "belum diisi";
  if (draft.alwaysUseSampleEmail && !body) return "aktif, butuh isi body";
  return "aktif";
}

function formatAttachmentSummary(draft: Partial<PdktScenario>): string {
  const count = draft.attachmentImages?.length || 0;
  return `${count} file`;
}

export function ScenarioAdvancedSummary({
  draft,
  isExpanded,
  onToggle,
}: ScenarioAdvancedSummaryProps) {
  return (
    <div
      id="scenario-form-advanced-summary"
      className="rounded-xl border border-border bg-background px-4 py-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold text-foreground tracking-tight">
            Detail Lanjutan (Opsional)
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            Konfigurasi ini hanya dipakai jika dibutuhkan untuk target email atau lampiran tambahan.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
        >
          {isExpanded ? (
            <>
              <ChevronLeft className="w-3.5 h-3.5" />
              Kembali ke Info Dasar
            </>
          ) : (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              Buka Detail
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border border-border bg-card/30 px-3 py-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="w-3.5 h-3.5" />
            Email tujuan
          </div>
          <div className="mt-1 font-medium text-foreground">
            {formatRecipientSummary(draft)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card/30 px-3 py-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="w-3.5 h-3.5" />
            Template email
          </div>
          <div className="mt-1 font-medium text-foreground">
            {formatTemplateSummary(draft)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card/30 px-3 py-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Paperclip className="w-3.5 h-3.5" />
            Lampiran
          </div>
          <div className="mt-1 font-medium text-foreground">
            {formatAttachmentSummary(draft)}
          </div>
        </div>
      </div>
    </div>
  );
}
