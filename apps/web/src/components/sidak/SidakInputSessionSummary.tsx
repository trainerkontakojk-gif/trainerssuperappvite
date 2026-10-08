import type { ReactNode } from "react";
import type { ServiceWeight } from "@trainers/types";
import type { QAScoreResult } from "../../lib/scoring";
import {
  SIDAK_QA_TARGET,
  SIDAK_SCORE_TEXT,
  sidakScoreLabel,
  sidakScoreTone,
} from "../../utils/sidakScoreStatus";

interface Props {
  liveScore: QAScoreResult | null;
  activeWeight: ServiceWeight | null;
  temuanCount: number;
  ticketCount: number;
  /** Aksi header daftar (Tambah, Import, Sesi Tanpa Temuan). */
  actions?: ReactNode;
}

function percent(weight: number): number {
  return Math.round(weight * 100);
}

/**
 * Ringkasan sesi satu baris di atas daftar temuan: skor live, status terhadap
 * target QA, jumlah temuan, dan jumlah tiket. Menggantikan kartu skor bergauge.
 */
export default function SidakInputSessionSummary({
  liveScore,
  activeWeight,
  temuanCount,
  ticketCount,
  actions,
}: Props) {
  const tone = liveScore ? sidakScoreTone(liveScore.finalScore) : null;

  return (
    <section
      data-testid="sidak-session-summary"
      aria-label="Ringkasan sesi"
      className="flex flex-col gap-3 border-y border-border py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 space-y-1">
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          {liveScore && tone ? (
            <div className="flex items-baseline gap-2">
              <dt className="text-muted-foreground">Skor</dt>
              <dd className="flex items-baseline gap-2">
                <span
                  className={`font-outfit text-2xl font-semibold tabular-nums ${SIDAK_SCORE_TEXT[tone]}`}
                >
                  {liveScore.finalScore}
                </span>
                <span className={`font-medium ${SIDAK_SCORE_TEXT[tone]}`}>
                  {sidakScoreLabel(liveScore.finalScore)}
                </span>
                <span className="text-xs text-muted-foreground">
                  target {SIDAK_QA_TARGET}
                </span>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="sr-only">Jumlah temuan</dt>
            <dd className="tabular-nums">{temuanCount} temuan</dd>
          </div>
          <div>
            <dt className="sr-only">Jumlah tiket</dt>
            <dd className="tabular-nums">{ticketCount} tiket</dd>
          </div>
        </dl>
        {liveScore && activeWeight ? (
          <p className="text-xs text-muted-foreground">
            {liveScore.mode === "weighted" ? (
              <>
                Non-kritikal {liveScore.nonCriticalScore} (
                {percent(activeWeight.non_critical_weight)}%) · Kritikal{" "}
                {liveScore.criticalScore} ({percent(activeWeight.critical_weight)}
                %) · {liveScore.sessionCount} sesi, maks. 5 sesi terendah
              </>
            ) : liveScore.mode === "flat" ? (
              <>Penilaian flat (proporsional bobot) · {liveScore.sessionCount} sesi</>
            ) : (
              <>Tanpa kategori (bobot setara) · {liveScore.sessionCount} sesi</>
            )}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </section>
  );
}
