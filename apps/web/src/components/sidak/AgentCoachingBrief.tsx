import { useMemo } from "react";
import { Copy } from "lucide-react";
import type { RootCauseResult } from "@trainers/types";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { notify } from "../../lib/toast";
import { topTicketLabel } from "./rootCauseTicketUtils";
import {
  SIDAK_QA_TARGET,
  SIDAK_SCORE_TEXT,
  describeScoreChange,
  sidakScoreLabel,
  sidakScoreTone,
} from "../../utils/sidakScoreStatus";

interface BriefTicket {
  no_tiket: string;
  scoreDeduction: number;
  findingCount: number;
  heaviestParam: string;
  isSamplingQa?: boolean;
}

interface BriefFinding {
  month: number;
  year: number;
  indicatorName: string;
  nilai: number;
}

interface Props {
  /** Judul bulan terpilih, mis. "Juni 2026". */
  monthTitle: string;
  month: number;
  year: number;
  score: number;
  previousScore: number | null;
  previousMonthName?: string;
  findings: BriefFinding[];
  tickets: BriefTicket[];
  causes: RootCauseResult[];
  onTicketSelect: (ticketKey: string) => void;
}

/** Nilai 3 = sesuai; di bawahnya dihitung sebagai temuan. */
const COMPLIANT_NILAI = 3;


/**
 * Bahan coaching untuk bulan terpilih di detail agen: skor dan statusnya,
 * parameter yang paling sering muncul, pola akar masalah, dan tiga tiket
 * pengurang terbesar. Semua dari data detail agen yang sudah dimuat.
 */
export default function AgentCoachingBrief({
  monthTitle,
  month,
  year,
  score,
  previousScore,
  previousMonthName,
  findings,
  tickets,
  causes,
  onTicketSelect,
}: Props) {
  const tone = sidakScoreTone(score);
  const change =
    previousScore !== null && previousMonthName
      ? describeScoreChange(score - previousScore, previousMonthName)
      : "Belum ada bulan pembanding";

  const frequent = useMemo(() => {
    const monthFindings = findings.filter(
      (finding) =>
        finding.month === month &&
        finding.year === year &&
        finding.nilai < COMPLIANT_NILAI,
    );
    const counts = new Map<string, number>();
    for (const finding of monthFindings) {
      counts.set(
        finding.indicatorName,
        (counts.get(finding.indicatorName) ?? 0) + 1,
      );
    }
    const [top] = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "id"),
    );
    return top
      ? { name: top[0], count: top[1], total: monthFindings.length }
      : null;
  }, [findings, month, year]);

  const cause = causes[0] ?? null;
  const topTickets = tickets.slice(0, 3);

  const copySummary = async () => {
    const lines = [
      `Bahan coaching ${monthTitle}`,
      `Skor ${score.toFixed(1)}% (${sidakScoreLabel(score)}, target ${SIDAK_QA_TARGET}). ${change}.`,
      frequent
        ? `Paling sering: ${frequent.name} (${frequent.count} dari ${frequent.total} temuan).`
        : "Tidak ada temuan bulan ini.",
      ...(cause ? [`Pola: ${cause.label}. ${cause.recommendation}`] : []),
      ...topTickets.map(
        (ticket) =>
          `${topTicketLabel(ticket)}: −${ticket.scoreDeduction.toFixed(1)} poin, ${ticket.heaviestParam}`,
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      notify.success("Ringkasan coaching disalin.");
    } catch {
      notify.error("Ringkasan tidak bisa disalin di browser ini.");
    }
  };

  return (
    <section
      aria-labelledby="agent-coaching-brief-title"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-col gap-0.5">
          <h2
            id="agent-coaching-brief-title"
            className="font-display text-lg font-bold tracking-tight text-foreground"
          >
            Bahan coaching
          </h2>
          <p className="text-sm text-fg2">{monthTitle}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void copySummary()}
          className="min-h-[44px]"
        >
          <Copy data-icon="inline-start" aria-hidden="true" />
          Salin ringkasan
        </Button>
      </div>

      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1 bg-surface-elevated p-4">
          <span className="text-sm text-fg2">Skor {monthTitle}</span>
          <span className="font-mono text-4xl leading-none font-bold tracking-tight text-foreground tabular-nums">
            {score.toFixed(1)}
            <span className="ml-0.5 text-sm font-medium text-fg2">%</span>
          </span>
          <span className={cn("text-sm font-semibold", SIDAK_SCORE_TEXT[tone])}>
            {sidakScoreLabel(score)}
          </span>
          <span className="text-xs text-fg2 tabular-nums">{change}</span>
        </div>

        <div className="flex flex-col gap-1.5 bg-surface-elevated p-4">
          <span className="text-sm text-fg2">Paling sering muncul</span>
          {frequent ? (
            <>
              <span className="font-semibold text-foreground">
                {frequent.name}
              </span>
              <span className="text-sm text-fg2">
                {frequent.count} dari {frequent.total} temuan bulan ini.
              </span>
            </>
          ) : (
            <span className="text-sm text-fg2">
              Belum ada temuan di bulan ini.
            </span>
          )}
          {cause ? (
            <p className="text-sm text-fg2">
              <span className="font-medium text-foreground">
                Pola: {cause.label}.
              </span>{" "}
              {cause.recommendation}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1 bg-surface-elevated p-4">
          <span className="text-sm text-fg2">Tiket pengurang terbesar</span>
          {topTickets.length === 0 ? (
            <span className="text-sm text-fg2">
              Tidak ada tiket yang mengurangi skor.
            </span>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {topTickets.map((ticket) => (
                <li key={ticket.no_tiket}>
                  <button
                    type="button"
                    onClick={() => onTicketSelect(ticket.no_tiket)}
                    title="Lihat di tab Temuan"
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-md px-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                  >
                    <span className="min-w-0 truncate font-mono text-sm text-foreground">
                      {topTicketLabel(ticket)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-sm font-semibold tabular-nums",
                        SIDAK_SCORE_TEXT.bad,
                      )}
                    >
                      −{ticket.scoreDeduction.toFixed(1)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
