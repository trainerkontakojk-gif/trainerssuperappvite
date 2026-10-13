import React, { useId, useState } from "react";
import {
  ListChecks,
  FileEdit,
  Copy,
  Check,
  MessageSquareText,
} from "lucide-react";
import type {
  PdktDimensionKey,
  PdktEvaluationEdu,
  PdktReplyAnnotation,
} from "@trainers/types";
import { Button } from "./ui/button";

/**
 * Evaluasi Edukatif PDKT — action items (priorityRank dari backend),
 * tips per dimensi, dan contoh balasan yang lebih baik.
 * actionItems deterministik dihasilkan backend saat evaluasi (termasuk
 * backfill); tanpa narasi AI (legacy) hanya item prioritas yang tampil.
 */

function CopyInlineButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
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
      className="min-h-11 gap-1 rounded-md px-2.5 text-xs font-bold uppercase tracking-wider"
    >
      {copied ? (
        <Check className="w-3 h-3 text-emerald-500" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
      {copied ? "Tersalin" : "Salin"}
    </Button>
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
          <li
            key={`${item.priorityRank}-${item.dimension}`}
            className="flex gap-2.5 items-start"
          >
            <span className="mt-0.5 w-5 h-5 shrink-0 rounded-md bg-amber-500 text-white flex items-center justify-center text-xs font-black">
              {item.priorityRank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--fg)] leading-relaxed font-medium">
                {item.text}
              </p>
              {item.example && (
                <blockquote className="mt-1 rounded-md border border-emerald-500/30 bg-emerald-500/5 py-1 pl-2 text-xs italic text-[var(--fg2)]">
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
          text={[
            rewrite.subject ? `Subjek: ${rewrite.subject}` : "",
            rewrite.body,
          ]
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
      parts.push(<span key={`txt-${key}`}>{remaining}</span>);
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
    <p className="mt-1.5 text-xs leading-snug text-amber-600 dark:text-amber-500 font-medium border-t border-amber-500/20 pt-1.5 text-left">
      💡 {tip}
    </p>
  );
}

const DIMENSION_LABELS: Record<PdktDimensionKey, string> = {
  recipientDirection: "Arah Penerima",
  normative: "Kualitas OJK",
  clarity: "Kejelasan",
  typo: "Typo",
  template: "Template",
};

type PlacedAnnotation = PdktReplyAnnotation & { number: number };

const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

/** Tandai hanya bila teks di posisi itu memang kutipannya (data lama/berbeda tidak salah tempat). */
function hasValidRange(
  annotation: PdktReplyAnnotation,
  body: string,
): annotation is PdktReplyAnnotation & { start: number; end: number } {
  return (
    typeof annotation.start === "number" &&
    typeof annotation.end === "number" &&
    annotation.start >= 0 &&
    annotation.start < annotation.end &&
    annotation.end <= body.length &&
    collapseSpaces(body.slice(annotation.start, annotation.end)) ===
      collapseSpaces(annotation.quote)
  );
}

/**
 * Balasan agent dengan kalimat yang dikomentari AI ditandai dan diberi nomor.
 * Posisi tanda dihitung backend; catatan tanpa posisi tetap tampil di daftar.
 */
export function PdktReplyAnnotationsCard({
  annotations,
  replyBody,
  title = "Catatan di balasan Anda",
}: {
  annotations: PdktReplyAnnotation[] | null | undefined;
  replyBody: string | null | undefined;
  /** Peserta melihat "Anda"; panel review trainer memakai "agent". */
  title?: string;
}) {
  const titleId = useId();
  const body = replyBody ?? "";
  if (!annotations?.length || !body) return null;

  // Nomor mengikuti urutan baca; catatan tanpa tanda di akhir daftar.
  const ordered: PlacedAnnotation[] = [...annotations]
    .sort((a, b) => {
      const aStart = hasValidRange(a, body) ? a.start : Infinity;
      const bStart = hasValidRange(b, body) ? b.start : Infinity;
      return aStart - bStart;
    })
    .map((annotation, index) => ({ ...annotation, number: index + 1 }));
  const marked = ordered.filter((annotation) =>
    hasValidRange(annotation, body),
  ) as Array<PlacedAnnotation & { start: number; end: number }>;

  const segments: React.ReactNode[] = [];
  let cursor = 0;
  for (const annotation of marked) {
    if (annotation.start < cursor) continue;
    segments.push(body.slice(cursor, annotation.start));
    segments.push(
      <mark
        key={annotation.number}
        className="rounded-sm border-b-2 border-amber-500 bg-amber-500/15 px-0.5 text-[var(--fg)]"
      >
        {body.slice(annotation.start, annotation.end)}
        <sup className="ml-0.5 text-[11px] font-bold">{annotation.number}</sup>
      </mark>,
    );
    cursor = annotation.end;
  }
  segments.push(body.slice(cursor));

  return (
    <section
      aria-labelledby={titleId}
      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg)]"
    >
      <h4
        id={titleId}
        className="flex items-center gap-2 text-xs font-bold text-[var(--fg)] mb-3"
      >
        <MessageSquareText className="w-4 h-4 text-amber-500" aria-hidden="true" />
        {title}
      </h4>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--fg2)] font-medium">
        {segments}
      </p>
      <ol className="mt-4 space-y-2 border-t border-[var(--border)] pt-3">
        {ordered.map((annotation) => {
          const isMarked = hasValidRange(annotation, body);
          return (
            <li key={annotation.number} className="flex gap-2.5 text-xs">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[11px] font-bold text-[var(--fg)]">
                {annotation.number}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold text-[var(--fg)]">
                  {annotation.note}
                </span>
                <span className="text-[var(--fg3)] font-medium">
                  {DIMENSION_LABELS[annotation.dimension] ?? annotation.dimension}
                  {isMarked
                    ? null
                    : ` · Tidak ditandai di balasan: “${annotation.quote}”`}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
