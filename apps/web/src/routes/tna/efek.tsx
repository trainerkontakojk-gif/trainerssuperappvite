import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { EfekReport } from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import QaStatePanel from "../../components/ui/QaStatePanel";
import { SERVICE_LABELS } from "../../lib/scoring";
import { Surface, Field, State } from "./shared";
import { TnaTabs } from "./TnaTabs";
import { selectClass, sessionDates } from "./utils";
import { ProgramStats, ReportFilters } from "./efek-report-ui";
import {
  deltaClass,
  fmtDelta,
  monthLabel,
  reportQuery,
  sessionStatusLabel,
} from "./efek-report-format";

const actionClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-foreground";

export default function EfekIndex() {
  const search = useSearch({ from: "/tna/efek" });
  const navigate = useNavigate();
  const { session: _session, program: _program, ...filters } = search;
  const report = useApi<EfekReport>(`/tna/efek/report${reportQuery(filters)}`);
  const data = report.data;
  const programName = (code: string) =>
    data?.programs.find((p) => p.code === code)?.name ?? code;
  const visible =
    data?.sessions.filter(
      (s) => !search.program || s.program_code === search.program,
    ) ?? [];
  const pending = data?.programs.reduce((n, p) => n + p.pending, 0) ?? 0;

  return (
    <Surface
      title="EFEK · Evaluasi Efektivitas dan Kinerja"
      description="Perubahan skor QA dan temuan SIDAK agent sebelum dan sesudah pelatihan, dibandingkan dengan agent lain di layanan yang sama."
    >
      <TnaTabs current="efek" />
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          to="/tna/efek/impor"
          className={`${actionClass} border-border text-foreground`}
        >
          Impor peserta
        </Link>
        <Link
          to="/tna/efek/sesi/baru"
          search={search.program ? { program: search.program } : {}}
          className={`${actionClass} border-foreground bg-foreground text-background`}
        >
          + Sesi pelatihan
        </Link>
      </div>
      <State
        loading={report.loading}
        error={report.error}
        retry={report.refetch}
      />
      {data && (
        <>
          <ReportFilters
            to="/tna/efek"
            search={search}
            years={data.years}
            teams={data.teams}
          />
          <p className="text-sm text-muted-foreground">
            Data SIDAK sampai {monthLabel(data.data_until)}. Bulan pelatihan dan
            bulan berjalan tidak dihitung.
          </p>
          <section
            aria-label="Program pelatihan"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {data.programs.map((program) => {
              const own = data.sessions.filter(
                (s) => s.program_code === program.code,
              );
              return (
                <article
                  key={program.code}
                  className={`flex flex-col gap-3 rounded-lg border p-4 ${own.length ? "border-border bg-card" : "border-dashed border-border"}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-heading text-base font-bold">
                      {program.name}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {SERVICE_LABELS[program.service_type]}
                    </span>
                  </div>
                  {own.length ? (
                    <>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {own.length} sesi · {program.participants} peserta
                      </p>
                      <ProgramStats program={program} />
                      <Link
                        to="/tna/efek/program/$code"
                        params={{ code: program.code }}
                        search={filters}
                        className="mt-auto inline-flex min-h-[44px] items-center text-sm underline underline-offset-4"
                      >
                        Rincian {program.name}
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Belum ada sesi pelatihan.
                      </p>
                      <Link
                        to="/tna/efek/sesi/baru"
                        search={{ program: program.code }}
                        className="inline-flex min-h-[44px] items-center text-sm underline underline-offset-4"
                      >
                        + Sesi {program.name}
                      </Link>
                    </>
                  )}
                </article>
              );
            })}
          </section>
          {pending > 0 && (
            <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {pending} peserta belum bisa dinilai karena belum ada satu bulan
              pun yang selesai sesudah pelatihan. Mereka otomatis dinilai
              setelah bulan berikutnya ditutup.
            </p>
          )}

          <section aria-label="Sesi pelatihan" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-heading text-xl font-bold">Sesi pelatihan</h2>
              <div className="w-full sm:w-56">
                <Field label="Program">
                  <select
                    className={selectClass}
                    value={search.program ?? ""}
                    onChange={(e) =>
                      navigate({
                        to: "/tna/efek",
                        search: {
                          ...filters,
                          ...(e.target.value
                            ? { program: e.target.value }
                            : {}),
                        },
                        replace: true,
                      })
                    }
                  >
                    <option value="">Semua program</option>
                    {data.programs.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            {visible.length === 0 ? (
              <QaStatePanel
                type="empty"
                title="Belum ada sesi pelatihan"
                description="Tambah sesi pelatihan atau impor daftar peserta dari Excel untuk mulai mengukur."
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Sesi</th>
                      <th className="px-3 py-2 font-semibold">Program</th>
                      <th className="px-3 py-2 font-semibold">Layanan</th>
                      <th className="px-3 py-2 font-semibold">Tanggal</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Peserta
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Dievaluasi
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Rerata Δ skor
                      </th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((s) => (
                      <tr key={s.id} className="border-t border-border">
                        <td className="px-3 py-1">
                          <Link
                            to="/tna/efek/sesi/$id"
                            params={{ id: s.id }}
                            className="inline-flex min-h-[44px] items-center font-medium underline-offset-4 hover:underline"
                          >
                            {s.title}
                          </Link>
                        </td>
                        <td className="px-3 py-1">
                          <Link
                            to="/tna/efek/program/$code"
                            params={{ code: s.program_code }}
                            search={{ ...filters, session: s.id }}
                            aria-label={`Rincian ${s.title}`}
                            className="inline-flex min-h-[44px] items-center underline-offset-4 hover:underline"
                          >
                            {programName(s.program_code)}
                          </Link>
                        </td>
                        <td className="px-3 py-1">
                          {SERVICE_LABELS[s.service_type]}
                        </td>
                        <td className="px-3 py-1">{sessionDates(s)}</td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          {s.participants}
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          {s.evaluated}
                        </td>
                        <td
                          className={`px-3 py-1 text-right font-semibold tabular-nums ${deltaClass(s.avg_delta)}`}
                        >
                          {fmtDelta(s.avg_delta)}
                        </td>
                        <td className="px-3 py-1">{sessionStatusLabel(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </Surface>
  );
}
