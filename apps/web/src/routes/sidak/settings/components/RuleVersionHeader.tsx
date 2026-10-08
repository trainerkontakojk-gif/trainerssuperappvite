import { GitBranch, Rocket, Trash2 } from "lucide-react";
import type { RuleVersion } from "@trainers/types";
import { Button } from "@/components/ui/button";
import {
  RULE_STATUS_DOT,
  RULE_STATUS_HINT,
  ruleVersionStatusLabel,
} from "../constants";

interface RuleVersionHeaderProps {
  version: RuleVersion;
  periodLabel: string;
  busy: boolean;
  onPublish: () => void;
  onDeleteDraft: () => void;
  onCreateRevision: () => void;
}

const actionClass = "h-[44px] px-4";

/** Judul versi, status, periode efektif, aksi sesuai status, dan penjelasan satu kalimat. */
export function RuleVersionHeader({
  version,
  periodLabel,
  busy,
  onPublish,
  onDeleteDraft,
  onCreateRevision,
}: RuleVersionHeaderProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-outfit text-lg font-semibold text-foreground">
            Versi {version.version_number} ·{" "}
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${RULE_STATUS_DOT[version.status]}`}
              />
              {ruleVersionStatusLabel(version.status)}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Efektif mulai {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {version.status === "draft" && (
            <>
              <Button
                type="button"
                variant="ghost"
                className={`${actionClass} text-destructive hover:bg-destructive/10 hover:text-destructive`}
                disabled={busy}
                onClick={onDeleteDraft}
              >
                <Trash2 aria-hidden="true" />
                Hapus draft
              </Button>
              <Button
                type="button"
                className={actionClass}
                disabled={busy}
                onClick={onPublish}
              >
                <Rocket aria-hidden="true" />
                Publish…
              </Button>
            </>
          )}
          {version.status === "published" && (
            <Button
              type="button"
              className={actionClass}
              disabled={busy}
              onClick={onCreateRevision}
            >
              <GitBranch aria-hidden="true" />
              Buat revisi
            </Button>
          )}
        </div>
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">
        {RULE_STATUS_HINT[version.status]}
      </p>
    </div>
  );
}
