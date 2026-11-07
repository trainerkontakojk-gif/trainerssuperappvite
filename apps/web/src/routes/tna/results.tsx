import type { CSSProperties } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type {
  TnaEffectiveness,
  TnaEffectivenessGroup,
  TnaEffectivenessGroupBy,
  TnaFollowUp,
  TnaVerdict,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import { Input } from "../../components/ui/input";
import { SERVICE_LABELS } from "../../lib/scoring";
import type { TnaResultsSearch } from "../../router";
import { Field, State, Surface } from "./shared";
import { TnaTabs } from "./TnaTabs";
import {
  followUpLabels,
  gapTypeLabels,
  number,
  selectClass,
  verdictLabels,
} from "./utils";

// TNA phase 6 dashboard (plans/markdown/tna-phase-6.md D30, K39, K41, P-1,
// P-2). Completed plans only, from frozen values; EFEK stays separate.

const VERDICTS: { id: TnaVerdict; color: string }[] = [
  { id: "tercapai", color: "var(--verdict-good)" },
  { id: "tercapai_sebagian", color: "var(--verdict-mid)" },
  { id: "tidak_tercapai", color: "var(--verdict-bad)" },
];
const FOLLOW_UPS: TnaFollowUp[] = [
  "selesai_tuntas",
  "perlu_rencana_lanjutan",
  "eskalasi_non_training",
];
const GROUP_OPTIONS: { id: TnaEffectivenessGroupBy; label: string }[] = [
  { id: "program", label: "Program" },
  { id: "gap_type", label: "Jenis gap" },
  { id: "service", label: "Layanan" },
];
const COMPLETED_DATE = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const pct = (value: number | null) =>
  value === null ? "Belum tersedia" : `${number(value)}%`;
// Positive = the rate went down (better); the word carries the direction.
const rateChange = (drop: number | null) =>
  drop === null
    ? "Belum tersedia"
    : drop === 0
      ? "Tetap"
      : `${drop > 0 ? "Turun" : "Naik"} ${number(Math.abs(drop))} per 100 sesi`;
const duration = (days: number | null) =>
  days === null
    ? "Belum tersedia"
    : days < 1
      ? "Kurang dari 1 hari"
      : `${number(days)} hari`;
const countsText = <K extends string>(
  ids: readonly K[],
  counts: Record<K, number>,
  labels: Record<K, string>,
) =>
  ids
    .filter((id) => counts[id] > 0)
    .map((id) => `${counts[id]} ${labels[id].toLowerCase()}`)
    .join(" · ");

function groupLabel(by: TnaEffectivenessGroupBy, g: TnaEffectivenessGroup) {
  if (by === "program") return g.label ?? g.key;
  if (by === "gap_type")
    return gapTypeLabels[g.key as keyof typeof gapTypeLabels] ?? g.key;
  return SERVICE_LABELS[g.key as keyof typeof SERVICE_LABELS] ?? g.key;
}

/** Part-to-whole bar; the counts beside it carry the same information. */
function VerdictBar({
  verdicts,
  completed,
}: Pick<TnaEffectivenessGroup, "verdicts" | "completed">) {
  return (
    <div className="flex h-2.5 w-full max-w-md gap-0.5" aria-hidden="true">
      {VERDICTS.filter((v) => verdicts[v.id] > 0).map((v) => (
        <span
          key={v.id}
          title={`${verdictLabels[v.id]}: ${verdicts[v.id]} rencana`}
          className="h-full first:rounded-l last:rounded-r"
          style={
            {
              width: `${(verdicts[v.id] / completed) * 100}%`,
              background: v.color,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l-2 border-border pl-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-heading text-xl font-bold tabular-nums sm:text-2xl">
        {value}
      </dd>
    </div>
  );
}

function GroupRow({
  by,
  group: g,
}: {
  by: TnaEffectivenessGroupBy;
  group: TnaEffectivenessGroup;
}) {
  return (
    <li className="space-y-3 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-semibold">{groupLabel(by, g)}</h3>
        <p className="text-sm text-muted-foreground">
          <span className="tabular-nums">{g.completed}</span> selesai
          {g.thin && " · Data sedikit (kurang dari 3 rencana)"}
        </p>
      </div>
      <div className="space-y-1.5">
        <VerdictBar verdicts={g.verdicts} completed={g.completed} />
        <p className="text-sm">
          {countsText(
            VERDICTS.map((v) => v.id),
            g.verdicts,
            verdictLabels,
          )}
        </p>
      </div>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm sm:gap-x-6">
        <dt className="text-muted-foreground">Tercapai penuh</dt>
        <dd className="tabular-nums">{pct(g.fully_achieved_pct)}</dd>
        <dt className="text-muted-foreground">Median perubahan tingkat</dt>
        <dd className="tabular-nums">{rateChange(g.median_rate_drop)}</dd>
        <dt className="text-muted-foreground">Median durasi</dt>
        <dd className="tabular-nums">{duration(g.median_duration_days)}</dd>
        <dt className="text-muted-foreground">Tindak lanjut</dt>
        <dd>{countsText(FOLLOW_UPS, g.follow_ups, followUpLabels)}</dd>
      </dl>
      <details className="text-sm">
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center font-medium underline-offset-4 hover:underline">
          Lihat {g.plans.length} rencana
        </summary>
        <ul className="mt-1 space-y-1">
          {g.plans.map((plan) => (
            <li key={plan.id}>
              <Link
                to="/tna/rencana/$id"
                params={{ id: plan.id }}
                className="inline-flex min-h-[44px] flex-wrap items-center gap-x-2 underline underline-offset-4"
              >
                {plan.title}
              </Link>{" "}
              <span className="text-muted-foreground">
                · {verdictLabels[plan.verdict]} · selesai{" "}
                {COMPLETED_DATE.format(new Date(plan.completed_at))}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

export default function TnaResults() {
  const search = useSearch({ from: "/tna/hasil" });
  const navigate = useNavigate({ from: "/tna/hasil" });
  const by: TnaEffectivenessGroupBy = search.group ?? "program";
  const badRange = !!(search.from && search.to && search.from > search.to);
  const query = new URLSearchParams();
  if (search.group) query.set("group_by", search.group);
  if (search.from) query.set("from", search.from);
  if (search.to) query.set("to", search.to);
  const qs = query.toString();
  const result = useApi<TnaEffectiveness>(
    badRange ? null : `/tna/effectiveness${qs ? `?${qs}` : ""}`,
  );
  const update = (next: Partial<TnaResultsSearch>) =>
    navigate({
      search: (prev) => ({ ...prev, ...next }),
      replace: true,
    });
  const data = result.data;
  const filtered = !!(search.from || search.to);

  return (
    <Surface
      title="TNA"
      description="Hasil rencana TNA yang sudah selesai dievaluasi, dari angka yang dibekukan saat aktivasi dan saat selesai."
    >
      <TnaTabs current="hasil" />
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        Halaman ini hanya merangkum rencana TNA. Efek kelas simulasi terhadap
        skor QA ada di{" "}
        <Link
          to="/tna/efek"
          className="font-medium text-foreground underline underline-offset-4"
        >
          EFEK
        </Link>
        . Perbandingan bersifat indikatif, bukan bukti sebab-akibat.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Kelompokkan menurut">
          <select
            className={selectClass}
            value={by}
            onChange={(e) => {
              const value = e.target.value as TnaEffectivenessGroupBy;
              update({ group: value === "program" ? undefined : value });
            }}
          >
            {GROUP_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Selesai dari">
          <Input
            type="date"
            className="h-[44px]"
            value={search.from ?? ""}
            onChange={(e) => update({ from: e.target.value || undefined })}
          />
        </Field>
        <Field label="Selesai sampai">
          <Input
            type="date"
            className="h-[44px]"
            value={search.to ?? ""}
            onChange={(e) => update({ to: e.target.value || undefined })}
          />
        </Field>
      </div>
      {badRange && (
        <p role="alert" className="text-sm text-destructive">
          Tanggal awal harus sama dengan atau sebelum tanggal akhir.
        </p>
      )}

      <State
        loading={result.loading && !data}
        error={result.error}
        retry={result.refetch}
      />
      {data &&
        !result.error &&
        !badRange &&
        (data.summary.completed === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtered
              ? "Tidak ada rencana selesai pada rentang tanggal ini."
              : "Belum ada rencana selesai. Dashboard terisi setelah evaluasi pertama diselesaikan."}
          </p>
        ) : (
          <>
            <section aria-label="Ringkasan rencana selesai">
              <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat
                  label="Rencana selesai"
                  value={String(data.summary.completed)}
                />
                <Stat
                  label="Tercapai penuh"
                  value={pct(data.summary.fully_achieved_pct)}
                />
                <Stat
                  label="Median perubahan tingkat"
                  value={rateChange(data.summary.median_rate_drop)}
                />
                <Stat
                  label="Median durasi aktivasi–selesai"
                  value={duration(data.summary.median_duration_days)}
                />
              </dl>
            </section>
            <section aria-labelledby="tna-results-groups" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                  id="tna-results-groups"
                  className="font-heading text-xl font-bold"
                >
                  Per{" "}
                  {GROUP_OPTIONS.find((o) => o.id === by)!.label.toLowerCase()}
                </h2>
                <ul
                  aria-label="Keterangan verdict"
                  className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"
                >
                  {VERDICTS.map((v) => (
                    <li key={v.id} className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block size-2.5 rounded-sm"
                        style={{ background: v.color }}
                      />
                      {verdictLabels[v.id]}
                    </li>
                  ))}
                </ul>
              </div>
              <ul
                aria-label="Hasil per kelompok"
                className="divide-y divide-border border-y border-border"
              >
                {data.groups.map((group) => (
                  <GroupRow key={group.key} by={by} group={group} />
                ))}
              </ul>
            </section>
          </>
        ))}
    </Surface>
  );
}
