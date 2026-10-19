import { Fragment, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import type { EfekParticipantResult, EfekProgramReport } from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import QaStatePanel from "../../components/ui/QaStatePanel";
import { SERVICE_LABELS } from "../../lib/scoring";
import { Button } from "../../components/ui/button";
import { downloadEfekProgramHtml } from "./efek-export";
import { EfekExclusions } from "./efek-exclusions";
import { Surface, Field, State } from "./shared";
import { TnaTabs } from "./TnaTabs";
import { selectClass } from "./utils";
import {
  Chip,
  ProgramStats,
  RelativeChart,
  ReportFilters,
} from "./efek-report-ui";
import {
  STATUS_LABELS,
  deltaClass,
  fmt,
  fmtDelta,
  monthLabel,
  monthShort,
  offsetText,
  reportQuery,
} from "./efek-report-format";

type SortKey = "nama" | "delta" | "relative_delta";
const sortValue = (p: EfekParticipantResult, key: SortKey) =>
  key === "nama" ? p.nama : key === "delta" ? p.delta : p.relative_delta;

/** `/tna/efek/program/$code`: one program's charts, participants, and months. */
export default function EfekProgramPage() {
  const { code } = useParams({ from: "/tna/efek/program/$code" });
  const search = useSearch({ from: "/tna/efek/program/$code" });
  const navigate = useNavigate();
  const { program: _program, ...filters } = search;
  const report = useApi<EfekProgramReport>(
    `/tna/efek/report/${code}${reportQuery(filters)}`,
  );
  // Never present/export the previous cohort as the new filter's result.
  const data = report.loading || report.error ? null : report.data;
  const service = data ? SERVICE_LABELS[data.program.service_type] : "";
  const title = data
    ? `${data.program.name} · layanan ${service}`
    : "Rincian program";

  return (
    <Surface
      title={title}
      description={
        data
          ? `${data.participants.length} keikutsertaan terdaftar, ${data.program.evaluated} disertakan dengan data sebelum dan sesudah pelatihan. Data SIDAK sampai ${monthLabel(data.data_until)}.`
          : undefined
      }
    >
      <TnaTabs current="efek" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/tna/efek"
          search={{ ...filters, exclusions: undefined }}
          className="inline-flex min-h-[44px] items-center text-sm underline underline-offset-4"
        >
          Kembali ke EFEK
        </Link>
        {search.exclusions && (
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            onClick={() =>
              navigate({
                to: "/tna/efek/program/$code",
                params: { code },
                search: { ...search, exclusions: undefined },
                replace: true,
              })
            }
          >
            Reset pengecualian
          </Button>
        )}
        {data && data.participants.length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            onClick={() => downloadEfekProgramHtml(data, search)}
          >
            Unduh laporan
          </Button>
        )}
      </div>
      <State
        loading={report.loading}
        error={report.error}
        retry={report.refetch}
      />
      {data && (
        <>
          <ReportFilters
            to="/tna/efek/program/$code"
            params={{ code }}
            search={search}
            years={data.years}
            teams={data.teams}
          >
            <Field label="Sesi">
              <select
                className={selectClass}
                value={search.session ?? ""}
                onChange={(e) =>
                  navigate({
                    to: "/tna/efek/program/$code",
                    params: { code },
                    search: { ...search, session: e.target.value || undefined },
                    replace: true,
                  })
                }
              >
                <option value="">Semua sesi</option>
                {data.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </Field>
          </ReportFilters>
          <EfekExclusions
            report={data}
            value={search.exclusions}
            onChange={(rows) =>
              navigate({
                to: "/tna/efek/program/$code",
                params: { code },
                search: {
                  ...search,
                  exclusions: rows.length ? JSON.stringify(rows) : undefined,
                },
                replace: true,
              })
            }
          />
          {data.participants.length === 0 ? (
            <QaStatePanel
              type="empty"
              title="Belum ada peserta untuk filter ini"
              description="Ubah filter, atau tambah sesi pelatihan untuk program ini."
            />
          ) : (
            <>
              {!data.analysis && (
                <section
                  aria-label="Ringkasan program"
                  className="max-w-sm rounded-lg border border-border bg-card p-4"
                >
                  <ProgramStats program={data.program} />
                </section>
              )}
              {data.program.participants === 0 && (
                <p role="status" className="text-sm">
                  Semua peserta dikecualikan. Sertakan kembali agent untuk
                  melihat hasil analisis.
                </p>
              )}
              <section
                aria-label="Grafik relatif bulan pelatihan"
                className="space-y-2"
              >
                <div className="grid gap-3 lg:grid-cols-2">
                  <RelativeChart
                    title="Skor QA rata-rata, dihitung dari bulan pelatihan"
                    points={data.chart}
                    pick={(p) => [p.score, p.comparison_score]}
                    participantsLabel={`Peserta ${data.program.name}`}
                    comparisonLabel={`Agent ${service} lain`}
                  />
                  <RelativeChart
                    title="Temuan per sesi audit, dihitung dari bulan pelatihan"
                    points={data.chart}
                    pick={(p) => [
                      p.findings_per_session,
                      p.comparison_findings_per_session,
                    ]}
                    participantsLabel={`Peserta ${data.program.name}`}
                    comparisonLabel={`Agent ${service} lain`}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Sumbu bawah dihitung dari bulan pelatihan tiap orang (−3 =
                  tiga bulan sebelum, +3 = tiga bulan sesudah), jadi peserta
                  dari sesi berbeda bisa dibaca bersama.
                </p>
              </section>
              <ParticipantTable participants={data.participants} />
            </>
          )}
        </>
      )}
    </Surface>
  );
}

function ParticipantTable({
  participants,
}: {
  participants: EfekParticipantResult[];
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "delta",
    desc: true,
  });
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      [...participants].sort((a, b) => {
        const x = sortValue(a, sort.key);
        const y = sortValue(b, sort.key);
        if (x === null) return y === null ? 0 : 1;
        if (y === null) return -1;
        const order =
          typeof x === "string"
            ? x.localeCompare(y as string, "id")
            : x - (y as number);
        return sort.desc ? -order : order;
      }),
    [participants, sort],
  );
  const header = (key: SortKey, label: string, right = false) => (
    <th
      className={`whitespace-nowrap px-3 py-2 font-semibold ${right ? "text-right" : ""}`}
      aria-sort={
        sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"
      }
    >
      <button
        type="button"
        className="inline-flex min-h-[32px] items-center gap-1 underline-offset-4 hover:underline"
        onClick={() =>
          setSort((s) => ({
            key,
            desc: s.key === key ? !s.desc : key !== "nama",
          }))
        }
      >
        {label}
        {sort.key === key && (
          <span aria-hidden="true">{sort.desc ? "↓" : "↑"}</span>
        )}
      </button>
    </th>
  );
  const cell =
    "px-3 py-1.5 max-sm:flex max-sm:justify-between max-sm:gap-3 max-sm:px-0 max-sm:py-0.5 max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]";

  return (
    <section aria-label="Peserta" className="space-y-3">
      <h2 className="font-heading text-xl font-bold">Peserta</h2>
      <p className="text-sm text-muted-foreground">
        Pilih nama untuk melihat rincian bulanan: skor, sesi audit, dan temuan
        per bulan.
      </p>
      <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-border">
        <table className="w-full text-sm tabular-nums sm:min-w-[860px] max-sm:block">
          <thead className="bg-muted text-left text-xs text-muted-foreground max-sm:sr-only">
            <tr>
              {header("nama", "Peserta")}
              <th className="px-3 py-2 font-semibold">Sesi</th>
              <th className="px-3 py-2 font-semibold">
                Temuan per sesi sebelum → sesudah
              </th>
              <th className="px-3 py-2 font-semibold">
                Skor QA sebelum → sesudah
              </th>
              {header("delta", "Δ skor", true)}
              {header("relative_delta", "Δ relatif", true)}
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-3">
            {rows.map((p) => {
              const key = `${p.session_id}|${p.peserta_id}`;
              const expanded = open === key;
              return (
                <Fragment key={key}>
                  <tr className="border-t border-border align-top max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:rounded-lg max-sm:border max-sm:bg-card max-sm:p-3">
                    <td className="px-3 py-1.5 max-sm:px-0 max-sm:py-0">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : key)}
                        className="min-h-[44px] text-left font-semibold underline-offset-4 hover:underline"
                      >
                        {p.nama}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {p.tim ?? "Tanpa tim"} · {p.months_before} bln
                          sebelum, {p.months_after} bln sesudah
                        </span>
                      </button>
                    </td>
                    <td className={cell} data-label="Sesi">
                      <span>
                        {p.session_title}
                        <span className="block text-xs text-muted-foreground">
                          {monthShort({
                            year: Number(p.start_date.slice(0, 4)),
                            month: Number(p.start_date.slice(5, 7)),
                          })}
                        </span>
                      </span>
                    </td>
                    <td className={cell} data-label="Temuan per sesi">
                      {fmt(p.findings_per_session_before)} →{" "}
                      {fmt(p.findings_per_session_after)}
                    </td>
                    <td className={cell} data-label="Skor QA">
                      {fmt(p.score_before)} → {fmt(p.score_after)}
                    </td>
                    <td
                      className={`${cell} text-right font-semibold ${deltaClass(p.delta)}`}
                      data-label="Δ skor"
                    >
                      {fmtDelta(p.delta)}
                    </td>
                    <td
                      className={`${cell} text-right ${deltaClass(p.relative_delta)}`}
                      data-label="Δ relatif"
                    >
                      {fmtDelta(p.relative_delta)}
                    </td>
                    <td className={cell} data-label="Status">
                      <span className="flex flex-wrap gap-1">
                        <Chip status={p.status}>{STATUS_LABELS[p.status]}</Chip>
                        {p.thin && <Chip>Data tipis</Chip>}
                        {p.exclusion_reason && <Chip>Dikecualikan</Chip>}
                      </span>
                      {p.exclusion_reason && (
                        <p className="mt-1 max-w-[32ch] break-words text-xs">
                          Alasan: {p.exclusion_reason}
                        </p>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="max-sm:block">
                      <td
                        colSpan={7}
                        className="bg-muted/40 px-3 py-3 max-sm:block max-sm:rounded-lg"
                      >
                        <MonthlyBreakdown participant={p} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MonthlyBreakdown({
  participant: p,
}: {
  participant: EfekParticipantResult;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs tabular-nums">
        <caption className="mb-2 text-left text-sm font-semibold">
          Rincian bulanan {p.nama}
        </caption>
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="px-2 py-1 font-semibold">Bulan</th>
            <th className="px-2 py-1 font-semibold">Posisi</th>
            <th className="px-2 py-1 text-right font-semibold">Sesi audit</th>
            <th className="px-2 py-1 text-right font-semibold">Temuan</th>
            <th className="px-2 py-1 text-right font-semibold">
              Temuan per sesi
            </th>
            <th className="px-2 py-1 text-right font-semibold">Skor QA</th>
            <th className="px-2 py-1 text-right font-semibold">Agent lain</th>
          </tr>
        </thead>
        <tbody>
          {p.months.map((m) => (
            <tr
              key={`${m.year}-${m.month}`}
              className={`border-t border-border ${m.offset === 0 ? "text-muted-foreground" : ""}`}
            >
              <td className="px-2 py-1">{monthLabel(m)}</td>
              <td className="px-2 py-1">{offsetText(m.offset)}</td>
              <td className="px-2 py-1 text-right">
                {m.score === null ? "–" : m.sessions}
              </td>
              <td className="px-2 py-1 text-right">
                {m.score === null ? "–" : m.findings}
              </td>
              <td className="px-2 py-1 text-right">
                {m.score === null || !m.sessions
                  ? "–"
                  : fmt(m.findings / m.sessions)}
              </td>
              <td className="px-2 py-1 text-right font-semibold">
                {fmt(m.score)}
              </td>
              <td className="px-2 py-1 text-right">
                {fmt(m.comparison_score)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.months.length === 0 && (
        <p className="text-muted-foreground">Belum ada bulan yang selesai.</p>
      )}
    </div>
  );
}
