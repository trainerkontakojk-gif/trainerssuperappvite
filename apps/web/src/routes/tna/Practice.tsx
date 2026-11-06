import type {
  TnaPlanParticipant,
  TnaPlanPractice,
  TnaPracticeTarget,
} from "@trainers/types";
import { Button } from "../../components/ui/button";
import {
  number,
  practiceModuleLabels,
  practiceScoreScale,
  practiceStatusLabels,
  practiceTargetsText,
  telefunPracticeNote,
} from "./utils";

// TNA phase 3 progress section (plans/markdown/tna-phase-3.md D19, P-4, Q-1,
// Q-2). Practice data supports the QA evaluation; it never replaces it.
export function PracticeProgress({
  practice,
  targets,
  participants,
  retry,
}: {
  practice: TnaPlanPractice;
  targets: TnaPracticeTarget[];
  participants: TnaPlanParticipant[];
  retry: () => unknown;
}) {
  const names = new Map(
    participants.map((p) => [p.id, p.peserta_name_snapshot]),
  );
  return (
    <section
      aria-labelledby="tna-practice-heading"
      className="space-y-4 border-t border-border pt-6"
    >
      <h2 id="tna-practice-heading" className="font-heading text-xl font-bold">
        Progres latihan simulasi
      </h2>
      <p className="text-sm font-medium">
        Target: {practiceTargetsText(targets)}
      </p>
      {practice.state === "unavailable" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-destructive">
            Progres latihan simulasi belum bisa dimuat.
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            onClick={() => retry()}
          >
            Coba lagi
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-1 text-sm">
            {practice.summary.map((s) => (
              <li key={s.module}>
                {`${practiceModuleLabels[s.module]}: ${s.met} dari ${s.total} peserta memenuhi target`}
              </li>
            ))}
          </ul>
          <ul
            aria-label="Progres latihan per peserta"
            className="divide-y divide-border border-y border-border"
          >
            {practice.participants.map((row) => (
              <li key={row.participant_id} className="space-y-2 py-3">
                <p className="text-sm font-semibold">
                  {names.get(row.participant_id) ?? "Peserta tidak tersedia"}
                </p>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                  {targets.map(({ module }) => {
                    const entry = row.modules[module];
                    return (
                      <div key={module} className="contents">
                        <dt className="text-muted-foreground">
                          {practiceModuleLabels[module]}
                        </dt>
                        <dd className="tabular-nums">
                          {!entry
                            ? "Belum tersedia"
                            : entry.avg_score === null
                              ? `${entry.sessions} sesi · ${practiceStatusLabels[entry.status]}`
                              : `${entry.sessions} sesi · rata-rata ${number(entry.avg_score)} / ${practiceScoreScale[module]} · ${practiceStatusLabels[entry.status]}`}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
          </ul>
          <p className="max-w-[70ch] text-sm text-muted-foreground">
            {practice.state === "frozen"
              ? "Dibekukan saat rencana diselesaikan."
              : "Dihitung dari riwayat saat ini; sesi yang dihapus tidak terhitung."}
          </p>
        </>
      )}
      {targets.some((t) => t.module === "telefun") && (
        <p className="max-w-[70ch] text-sm text-muted-foreground">
          {telefunPracticeNote}
        </p>
      )}
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        Data latihan mendukung, bukan pengganti hasil QA.
      </p>
    </section>
  );
}
