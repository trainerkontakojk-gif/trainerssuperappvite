import React from "react";
import type { TelefunTranscriptEntry } from "@trainers/types";
import {
  formatTranscriptTimestamp,
  getTranscriptSpeakerLabel,
} from "./telefunTranscriptFormatters";

export interface TelefunTranscriptProps {
  entries?: TelefunTranscriptEntry[] | null;
  legacyText?: string | null;
  maxHeightClassName?: string;
}

export const TelefunTranscript: React.FC<TelefunTranscriptProps> = ({
  entries,
  legacyText,
  maxHeightClassName = "max-h-[240px]",
}) => {
  if (entries && entries.length > 0) {
    return (
      <ol
        aria-label="Transcript percakapan lengkap"
        className={`overflow-y-auto rounded-xl bg-slate-950/5 p-4 dark:bg-white/5 ${maxHeightClassName}`}
      >
        {entries.map((entry, i) => (
          <li
            key={i}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm leading-relaxed text-slate-700 dark:text-white/70"
          >
            <time className="shrink-0 font-mono tabular-nums text-slate-400 dark:text-white/40">
              {formatTranscriptTimestamp(entry.startMs)}:
            </time>
            <span className="min-w-0 flex-1 basis-[12rem] break-words">
              {entry.text}
            </span>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/40">
              ({getTranscriptSpeakerLabel(entry.speaker)})
            </span>
          </li>
        ))}
      </ol>
    );
  }

  if (legacyText?.trim()) {
    return (
      <div
        className={`overflow-y-auto rounded-xl bg-slate-950/5 p-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap dark:bg-white/5 dark:text-white/70 ${maxHeightClassName}`}
      >
        {legacyText}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center rounded-xl bg-slate-950/5 p-6 text-sm text-slate-400 dark:bg-white/5 dark:text-white/40">
      Transcript belum tersedia untuk sesi ini.
    </div>
  );
};
