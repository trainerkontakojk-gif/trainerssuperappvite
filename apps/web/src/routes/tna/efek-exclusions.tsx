import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  EFEK_MAX_EXCLUSIONS,
  efekReportQuerySchema,
  type EfekExclusion,
  type EfekProgramReport,
} from "@trainers/types";
import { Button } from "../../components/ui/button";
import { Field } from "./shared";
import { selectClass } from "./utils";
import { Input } from "../../components/ui/input";
import { ProgramStats } from "./efek-report-ui";

/** Analysis only: never changes attendance or SIDAK scores. */
export function EfekExclusions({
  report,
  value,
  onChange,
}: {
  report: EfekProgramReport;
  value?: string;
  onChange: (rows: EfekExclusion[]) => void;
}) {
  const parsed = efekReportQuerySchema.safeParse({ exclusions: value });
  const exclusions = parsed.success ? (parsed.data.exclusions ?? []) : [];
  const [agent, setAgent] = useState("");
  const [reason, setReason] = useState("");
  const people = [
    ...new Map(report.participants.map((p) => [p.peserta_id, p])).values(),
  ];
  const available = people.filter(
    (p) => !exclusions.some((r) => r.peserta_id === p.peserta_id),
  );
  const canApply =
    available.some((p) => p.peserta_id === agent) &&
    reason.trim().length > 0 &&
    reason.trim().length <= 200 &&
    exclusions.length < EFEK_MAX_EXCLUSIONS;
  return (
    <>
      {report.analysis && (
        <section aria-label="Perbandingan analisis" className="space-y-4">
          <h2 className="font-heading text-xl font-bold">
            Perbandingan analisis
          </h2>
          <p className="text-sm text-muted-foreground">
            {report.analysis.exclusions.length} agent dikecualikan. Ringkasan
            dan grafik di bawah menggunakan peserta yang disertakan; skor
            individu tetap ditampilkan.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <h3 className="font-semibold">Semua peserta</h3>
              <ProgramStats program={report.analysis.all_participants} />
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold">Setelah pengecualian</h3>
              <ProgramStats program={report.program} />
            </div>
          </div>
        </section>
      )}
      <section aria-label="Pengecualian analisis" className="space-y-4">
        <details
          className="group"
          open={exclusions.length > 0 ? true : undefined}
        >
          <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
            />
            Sesuaikan analisis
          </summary>
          <div className="mt-3 space-y-3 rounded-lg border border-border bg-card p-4">
            <p className="max-w-[70ch] text-sm text-muted-foreground">
              Kecualikan agent dari ringkasan dan grafik, bukan dari daftar
              peserta. Berlaku untuk semua sesi agent pada filter ini, maksimal{" "}
              {EFEK_MAX_EXCLUSIONS} agent.
            </p>
            <p className="max-w-[70ch] text-sm text-muted-foreground">
              Filter tersimpan di tautan ini, bukan pengaturan permanen. Alasan
              ikut dalam tautan dan unduhan laporan; jangan tulis informasi
              rahasia.
            </p>
            <form
              className="grid min-w-0 gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canApply) return;
                onChange([
                  ...exclusions,
                  { peserta_id: agent, reason: reason.trim() },
                ]);
                setAgent("");
                setReason("");
              }}
            >
              <Field label="Agent">
                <select
                  className={selectClass}
                  value={agent}
                  onChange={(e) => setAgent(e.target.value)}
                >
                  <option value="">Pilih agent</option>
                  {available.map((p) => (
                    <option key={p.peserta_id} value={p.peserta_id}>
                      {p.nama} · {p.tim ?? "Tanpa tim"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Alasan pengecualian (wajib)">
                <Input
                  className="h-[44px] min-w-0"
                  value={reason}
                  maxLength={200}
                  required
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="outline"
                className="min-h-[44px] w-fit max-w-full whitespace-normal text-left"
                disabled={!canApply}
              >
                Kecualikan dari analisis
              </Button>
            </form>
          </div>
        </details>
        {exclusions.length > 0 && (
          <section aria-label="Pengecualian aktif" className="space-y-2">
            <h3 className="text-sm font-semibold">Pengecualian aktif</h3>
            <ul className="divide-y divide-border border-y border-border">
              {exclusions.map((r) => {
                const name =
                  people.find((p) => p.peserta_id === r.peserta_id)?.nama ??
                  r.peserta_id;
                const applied = report.analysis?.exclusions.some(
                  (p) => p.peserta_id === r.peserta_id,
                );
                return (
                  <li
                    key={r.peserta_id}
                    className="flex min-w-0 flex-wrap items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1 break-words text-sm">
                      <p className="font-semibold">{name}</p>
                      <p>{r.reason}</p>
                      {!applied && (
                        <p className="text-muted-foreground">
                          Tidak ada peserta yang cocok pada filter ini.
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px]"
                      aria-label={`Sertakan kembali ${name}`}
                      onClick={() =>
                        onChange(
                          exclusions.filter(
                            (p) => p.peserta_id !== r.peserta_id,
                          ),
                        )
                      }
                    >
                      Sertakan kembali
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </section>
    </>
  );
}
