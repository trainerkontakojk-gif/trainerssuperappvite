import type { AgentSidakSelf, SidakAgentRankQuickview } from "@trainers/types";
import { SidakPageHeader } from "../../components/sidak/SidakPageHeader";
import QaStatePanel from "../../components/ui/QaStatePanel";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useApi } from "../../hooks/useApi";
import { SERVICE_LABELS } from "../../lib/scoring";
import { QaResult } from "../dashboard/home/AgentQaSummary";

type Standing = NonNullable<AgentSidakSelf["standing"]>;

function rankText(rank: SidakAgentRankQuickview | null) {
  if (!rank || rank.rank === null) return "Belum ada peringkat";
  return `${rank.rank} dari ${rank.total} agen`;
}

function StandingPanel({ standing }: { standing: Standing }) {
  const rows: [label: string, value: string, note?: string][] = [
    [
      "Tim gabungan",
      rankText(standing.combinedTeam),
      standing.combinedTeam?.scopeLabel,
    ],
    [
      "Tim leader",
      rankText(standing.leaderTeam),
      standing.leaderTeam?.scopeLabel,
    ],
    [
      "Arah 3 bulan ke depan",
      standing.forecast?.label ?? "Data belum cukup",
      standing.forecast?.supportingText,
    ],
  ];
  return (
    <div className="home-panel">
      <p className="text-[13px] text-fg2">
        {SERVICE_LABELS[standing.serviceType]} · tahun {standing.year} ·
        peringkat berdasarkan temuan paling sedikit
      </p>
      <dl className="mt-3">
        {rows.map(([label, value, note]) => (
          <div
            key={label}
            className="grid gap-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-4"
          >
            <dt className="text-[13px] text-fg2">{label}</dt>
            <dd className="min-w-0">
              <span className="text-sm font-semibold text-fg tabular-nums">
                {value}
              </span>
              {note ? (
                <span className="block text-[13px] text-fg2">{note}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** SIDAK saya: the agent's own QA data only (`GET /sidak/me`). */
export default function SidakSayaPage() {
  const { data, error, refetch } = useApi<AgentSidakSelf>("/sidak/me");

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 pt-6 pb-28 sm:px-6">
      <SidakPageHeader
        title="SIDAK saya"
        eyebrow={null}
        description="Hasil audit QA Anda sendiri: skor terakhir, tren, parameter yang perlu diperbaiki, dan posisi Anda di tim."
      />

      {error ? (
        <QaStatePanel
          type="error"
          title="Data SIDAK Anda belum dapat dimuat"
          description={error}
          action={
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => void refetch()}
            >
              Coba lagi
            </Button>
          }
        />
      ) : !data ? (
        <div className="home-panel space-y-3" aria-busy="true">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <span className="sr-only">Memuat data SIDAK Anda</span>
        </div>
      ) : !data.linked ? (
        <QaStatePanel
          type="empty"
          title="Akun Anda belum ditautkan ke data peserta"
          description="Hubungi admin atau trainer untuk menautkan akun Anda. Latihan tetap tersedia."
        />
      ) : !data.qa ? (
        <QaStatePanel
          type="empty"
          title="Belum ada audit QA"
          description="Akun sudah tertaut. Data SIDAK Anda tampil setelah audit pertama tersedia."
        />
      ) : (
        <>
          <section aria-labelledby="sidak-saya-qa" className="space-y-3">
            <h2
              id="sidak-saya-qa"
              className="text-base font-semibold text-foreground"
            >
              Skor QA
            </h2>
            <QaResult qa={data.qa} />
          </section>
          {data.standing ? (
            <section
              aria-labelledby="sidak-saya-standing"
              className="space-y-3"
            >
              <h2
                id="sidak-saya-standing"
                className="text-base font-semibold text-foreground"
              >
                Posisi dan arah
              </h2>
              <StandingPanel standing={data.standing} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
