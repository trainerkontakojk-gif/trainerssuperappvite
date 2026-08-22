import { useState } from "react";
import { motion } from "framer-motion";
import { Lightbulb, Copy, Check, BookOpen } from "lucide-react";
import type { KetikEducation } from "@trainers/types";

/**
 * Evaluasi Edukatif KETIK — lapisan edukasi di atas skor deterministik.
 * Render `education` dari backend (AI narration + score/verdict/priorityRank
 * deterministik). Fallback rule-based sudah diisi backend untuk histori lama,
 * jadi komponen ini selalu menerima data lengkap bila tersedia.
 */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — keep button silent
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Tersalin" : "Salin contoh"}
      className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-border/60 bg-card text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      {copied ? "Tersalin" : "Salin"}
    </button>
  );
}

function GuidanceCard({
  rank,
  label,
  verdict,
  diagnosis,
  howToFix,
  exampleRewrite,
  defaultOpen = false,
}: {
  rank?: number;
  label: string;
  verdict: string;
  diagnosis: string;
  howToFix: string;
  exampleRewrite: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-border/50 bg-card overflow-hidden"
    >
      <summary className="flex items-center gap-3 p-4 cursor-pointer select-none list-none hover:bg-foreground/[0.03] transition-colors">
        {rank !== undefined && (
          <span className="w-6 h-6 shrink-0 rounded-lg bg-primary/15 text-primary flex items-center justify-center text-[11px] font-black">
            {rank}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground">{label}</span>
            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {verdict}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {howToFix}
          </p>
        </div>
        <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 group-open:hidden" />
        <BookOpen className="w-4 h-4 text-primary shrink-0 hidden group-open:block" />
      </summary>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3"
      >
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Diagnosis
          </div>
          <p className="text-sm text-foreground/75 leading-relaxed">
            {diagnosis}
          </p>
        </div>
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Cara Memperbaiki
          </div>
          <p className="text-sm text-foreground/75 leading-relaxed">
            {howToFix}
          </p>
        </div>
        {exampleRewrite && (
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
              Contoh Perbaikan
            </div>
            <blockquote className="text-sm text-foreground/80 italic leading-relaxed bg-emerald-500/5 border-l-2 border-emerald-500/50 pl-3 pr-3 py-2 rounded-r-xl">
              {exampleRewrite}
            </blockquote>
            <div className="mt-2">
              <CopyButton text={exampleRewrite} />
            </div>
          </div>
        )}
      </motion.div>
    </details>
  );
}

export function KetikPriorityFixes({
  education,
}: {
  education: KetikEducation | null | undefined;
}) {
  if (!education?.dimensionGuidance?.length) return null;

  const topThree = [...education.dimensionGuidance]
    .sort((a, b) => a.priorityRank - b.priorityRank)
    .slice(0, 3);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          3 Prioritas Perbaikan Minggu Ini
        </h3>
      </div>
      <ol className="space-y-2">
        {topThree.map((g) => (
          <li
            key={g.key}
            className="flex gap-3 items-start p-3 rounded-xl bg-amber-500/5 border border-amber-500/15"
          >
            <span className="mt-0.5 w-6 h-6 shrink-0 rounded-lg bg-amber-500 text-white flex items-center justify-center text-[11px] font-black">
              {g.priorityRank}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground/85 leading-snug">
                {g.label}
              </p>
              <p className="text-sm text-foreground/70 leading-snug mt-0.5">
                {g.howToFix}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function KetikDimensionGuidanceList({
  education,
}: {
  education: KetikEducation | null | undefined;
}) {
  if (!education?.dimensionGuidance?.length) return null;

  // Dimensions needing attention first (score < 75), then the rest.
  const sorted = [...education.dimensionGuidance].sort((a, b) => {
    const aNeeds = a.score < 75 ? 0 : 1;
    const bNeeds = b.score < 75 ? 0 : 1;
    if (aNeeds !== bNeeds) return aNeeds - bNeeds;
    return a.priorityRank - b.priorityRank;
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Cara Memperbaiki Per Dimensi
        </h3>
      </div>
      <div className="space-y-2">
        {sorted.map((g) => (
          <GuidanceCard
            key={g.key}
            rank={g.priorityRank}
            label={g.label}
            verdict={g.verdict}
            diagnosis={g.diagnosis}
            howToFix={g.howToFix}
            exampleRewrite={g.exampleRewrite}
            defaultOpen={g.score < 75 && g.priorityRank === 1}
          />
        ))}
      </div>
    </section>
  );
}

export function KetikTypoEnrichedContext({
  education,
}: {
  education: KetikEducation | null | undefined;
}) {
  const enriched = education?.typosEnriched ?? [];
  if (enriched.length === 0) return null;

  return (
    <div className="space-y-1">
      {enriched.map((t, i) => (
        <div
          key={`${t.messageId}-${t.originalWord}-${i}`}
          className="text-xs text-muted-foreground leading-relaxed"
        >
          {t.contextSentence && (
            <span className="italic">&ldquo;{t.contextSentence}&rdquo; </span>
          )}
          {t.whyWrong && <span>— {t.whyWrong}</span>}
        </div>
      ))}
    </div>
  );
}
