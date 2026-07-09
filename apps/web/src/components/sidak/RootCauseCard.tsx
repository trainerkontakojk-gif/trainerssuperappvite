import { AlertCircle, ListChecks, SearchCheck } from "lucide-react";
import type { RootCauseResult } from "@trainers/types";

interface RootCauseCardProps {
  causes: RootCauseResult[];
  monthLabel?: string;
}

export default function RootCauseCard({
  causes,
  monthLabel,
}: RootCauseCardProps) {
  const primary = causes[0];
  const secondary = causes.slice(1, 4);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 lg:p-6">
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
            <SearchCheck className="h-4 w-4" />
            Diagnosis Akar Masalah
          </h4>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {monthLabel
              ? `Berdasarkan temuan ${monthLabel}`
              : "Berdasarkan temuan bulan aktif"}
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {causes.length} pola
        </span>
      </div>

      {!primary ? (
        <div className="py-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Belum ada pola akar masalah yang dominan
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Primary cause — highest priority */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground">
                Prioritas {primary.priority}
              </span>
              {primary.criticalFindingsCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-500">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {primary.criticalFindingsCount} critical
                </span>
              )}
            </div>
            <h5 className="break-words font-outfit text-lg font-bold leading-snug text-foreground">
              {primary.label}
            </h5>
            <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground">
              <span>{primary.findingsCount} temuan</span>
              <span>{primary.affectedTickets} tiket</span>
              {primary.matchedKeywords[0] && (
                <span>Keyword: {primary.matchedKeywords[0]}</span>
              )}
            </div>
            <p className="text-sm font-medium leading-relaxed text-foreground">
              {primary.recommendation}
            </p>
          </div>

          {/* Evidence snippets for primary cause */}
          {primary.evidence.length > 0 && (
            <div className="space-y-2">
              {primary.evidence.slice(0, 2).map((item) => (
                <blockquote
                  key={item.id}
                  className="break-words rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium leading-relaxed text-muted-foreground"
                >
                  &ldquo;{item.text}&rdquo;
                </blockquote>
              ))}
            </div>
          )}

          {/* Secondary causes — compact rows */}
          {secondary.length > 0 && (
            <div className="divide-y divide-border border-t border-border">
              {secondary.map((cause) => (
                <div
                  key={cause.clusterId}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-3"
                >
                  <ListChecks className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-foreground">
                      {cause.label}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">
                      {cause.recommendation}
                    </p>
                  </div>
                  <div className="text-right text-xs font-bold text-foreground">
                    {cause.findingsCount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
