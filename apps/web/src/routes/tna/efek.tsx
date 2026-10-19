import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { EfekProgram, EfekSession } from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import QaStatePanel from "../../components/ui/QaStatePanel";
import { SERVICE_LABELS } from "../../lib/scoring";
import { Surface, Field, State } from "./shared";
import { TnaTabs } from "./TnaTabs";
import { selectClass, sessionDates } from "./utils";

const actionClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-foreground";

export default function EfekIndex() {
  const search = useSearch({ from: "/tna/efek" });
  const navigate = useNavigate();
  const programs = useApi<EfekProgram[]>("/tna/efek/programs");
  const sessions = useApi<{ items: EfekSession[] }>("/tna/efek/sessions");
  const programName = (code: string) =>
    programs.data?.find((p) => p.code === code)?.name ?? code;
  const visible =
    sessions.data?.items.filter(
      (s) => !search.program || s.program_code === search.program,
    ) ?? [];

  return (
    <Surface
      title="EFEK · Evaluasi Efektivitas dan Kinerja"
      description="Catat siapa yang ikut pelatihan dan kapan. EFEK membandingkan skor QA dan temuan SIDAK mereka sebelum dan sesudah pelatihan."
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
        loading={programs.loading || sessions.loading}
        error={programs.error || sessions.error}
        retry={() => {
          programs.refetch();
          sessions.refetch();
        }}
      />
      {programs.data && sessions.data && (
        <>
          <section
            aria-label="Program pelatihan"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {programs.data.map((program) => {
              const own = sessions.data!.items.filter(
                (s) => s.program_code === program.code,
              );
              const people = own.reduce((n, s) => n + s.participant_count, 0);
              return (
                <article
                  key={program.code}
                  className={`flex flex-col gap-2 rounded-lg border p-4 ${own.length ? "border-border bg-card" : "border-dashed border-border"}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-heading text-base font-bold">
                      {program.name}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {SERVICE_LABELS[program.default_service_type]}
                    </span>
                  </div>
                  {own.length ? (
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {own.length} sesi · {people} peserta
                    </p>
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
                        search: e.target.value
                          ? { program: e.target.value }
                          : {},
                        replace: true,
                      })
                    }
                  >
                    <option value="">Semua program</option>
                    {programs.data.map((p) => (
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
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Sesi</th>
                      <th className="px-3 py-2 font-semibold">Program</th>
                      <th className="px-3 py-2 font-semibold">Layanan</th>
                      <th className="px-3 py-2 font-semibold">Tanggal</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Peserta
                      </th>
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
                          {programName(s.program_code)}
                        </td>
                        <td className="px-3 py-1">
                          {SERVICE_LABELS[s.service_type]}
                        </td>
                        <td className="px-3 py-1">{sessionDates(s)}</td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          {s.participant_count}
                        </td>
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
