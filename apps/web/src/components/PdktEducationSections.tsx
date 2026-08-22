import { useState } from "react";
import { ListChecks, FileEdit, Copy, Check } from "lucide-react";
import type {
  PdktDimensionKey,
  PdktEvaluationEdu,
} from "@trainers/types";

/**
 * Evaluasi Edukatif PDKT — action items (priorityRank dari backend),
 * tips per dimensi, dan contoh balasan yang lebih baik.
 * Fallback rule-based sudah diisi backend untuk histori lama.
 */

function CopyInlineButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Tersalin" : "Salin"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // clipboard unavailable
        }
      }}
      className="inline-flex items-center gap-1 h-9 px-2.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[10px] font-bold uppercase tracking-wider text-[var(--fg3)] hover:text-[var(--fg)] transition-colors"
    >
      {copied ? (
        <Check className="w-3 h-3 text-emerald-500" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
      {copied ? "Tersalin" : "Salin"}
    </button>
  );
}

export function PdktActionItemsCard({
  edu,
}: {
  edu: PdktEvaluationEdu | null | undefined;
}) {
  const items = edu?.actionItems ?? [];
  if (items.length === 0) return null;

  const ranked = [...items].sort((a, b) => a.priorityRank - b.priorityRank);

  return (
    <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/5">
      <h4 className="flex items-center gap-2 text-xs font-bold text-[var(--fg)] mb-3">
        <ListChecks className="w-4 h-4 text-amber-500" />
        Action Items Prioritas
      </h4>
      <ol className="space-y-2">
        {ranked.map((item) => (
          <li key={`${item.priorityRank}-${item.dimension}`} className="flex gap-2.5 items-start">
            <span className="mt-0.5 w-5 h-5 shrink-0 rounded-md bg-amber-500 text-white flex items-center justify-center text-[10px] font-black">
              {item.priorityRank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--fg)] leading-relaxed font-medium">
                {item.text}
              </p>
              {item.example && (
                <blockquote className="mt-1 text-xs italic text-[var(--fg2)] bg-emerald-500/5 border-l-2 border-emerald-500/50 pl-2 py-1 rounded-r">
                  {item.example}
                </blockquote>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PdktSuggestedRewriteCard({
  edu,
}: {
  edu: PdktEvaluationEdu | null | undefined;
}) {
  const rewrite = edu?.suggestedRewrite;
  // Legacy history without suggestedRewrite: hide the card entirely.
  if (!rewrite?.body) return null;

  return (
    <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5">
      <h4 className="flex items-center gap-2 text-xs font-bold text-[var(--fg)] mb-3">
        <FileEdit className="w-4 h-4 text-emerald-500" />
        Contoh Balasan yang Lebih Baik
      </h4>
      {rewrite.subject && (
        <p className="text-xs font-bold text-[var(--fg)] mb-1.5">
          Subjek: {rewrite.subject}
        </p>
      )}
      <p className="text-xs text-[var(--fg)] leading-relaxed whitespace-pre-line">
        {renderHighlights(rewrite.body, rewrite.highlights)}
      </p>
      <div className="mt-3">
        <CopyInlineButton
          text={[rewrite.subject ? `Subjek: ${rewrite.subject}` : "", rewrite.body]
            .filter(Boolean)
            .join("\n")}
        />
      </div>
    </div>
  );
}

function renderHighlights(
  body: string,
  highlights?: string[],
): React.ReactNode[] {
  if (!highlights || highlights.length === 0) return [body];

  const parts: React.ReactNode[] = [];
  let remaining = body;
  let key = 0;

  while (remaining.length > 0) {
    let earliest: { highlight: string; index: number } | null = null;
    for (const highlight of highlights) {
      const index = remaining.indexOf(highlight);
      if (index !== -1 && (!earliest || index < earliest.index)) {
        earliest = { highlight, index };
      }
    }
    if (!earliest) {
      parts.push(<span key={`txt-${key++}`}>{remaining}</span>);
      break;
    }
    if (earliest.index > 0) {
      parts.push(
        <span key={`txt-${key++}`}>{remaining.slice(0, earliest.index)}</span>,
      );
    }
    parts.push(
      <mark
        key={`hl-${key++}`}
        className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded px-0.5"
      >
        {earliest.highlight}
      </mark>,
    );
    remaining = remaining.slice(earliest.index + earliest.highlight.length);
  }

  return parts;
}

/** Inline tip rendered below a breakdown row when value < 75. */
export function PdktDimensionTip({
  dimension,
  value,
  edu,
}: {
  dimension: PdktDimensionKey;
  value: number;
  edu: PdktEvaluationEdu | null | undefined;
}) {
  const tip = edu?.dimensionTips?.[dimension];
  if (value >= 75 || !tip) return null;
  return (
    <p className="mt-1.5 text-[10px] leading-snug text-amber-600 dark:text-amber-500 font-medium border-t border-amber-500/20 pt-1.5 text-left">
      💡 {tip}
    </p>
  );
}
