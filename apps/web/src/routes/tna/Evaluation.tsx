import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  completeTnaPlanSchema,
  type TnaPlanDetail,
  type TnaNeedDetail,
  type TnaFollowUp,
  type TnaCohortMetrics,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import { rpcClient } from "../../lib/api/rpc-client";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import { Field, Metrics, State } from "./shared";
import {
  number,
  selectClass,
  verdictLabels,
  followUpLabels,
  tnaResponse,
  type useTnaMutation,
} from "./utils";

export function Evaluation({
  detail: d,
  mutation,
  reload,
}: {
  detail: TnaPlanDetail;
  mutation: ReturnType<typeof useTnaMutation>;
  reload: () => Promise<void>;
}) {
  const p = d.plan;
  const evaluating = p.status === "evaluasi";
  const completed = p.status === "selesai";
  const options = d.evaluation_period_options ?? [];
  const [period, setPeriod] = useState(
    p.evaluation_period_id ??
      options.find((o) => o.is_default)?.id ??
      options[0]?.id ??
      "",
  );
  const [confirm, setConfirm] = useState<"start" | "complete" | null>(null);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<TnaFollowUp>("selesai_tuntas");
  const [sort, setSort] = useState<"name" | "findings">("name");
  const locked = mutation.busy || mutation.conflict;
  const e = d.evaluation;
  const participantNames = new Map(
    d.participants.map((p) => [p.id, p.peserta_name_snapshot]),
  );
  const participantResults = [...(d.participant_evaluation ?? [])].sort(
    (a, b) =>
      sort === "findings"
        ? (b.eval_findings ?? -1) - (a.eval_findings ?? -1)
        : (participantNames.get(a.participant_id) ?? "").localeCompare(
            participantNames.get(b.participant_id) ?? "",
            "id",
          ),
  );
  const completion = completeTnaPlanSchema.safeParse({
    conclusion_note: note,
    follow_up: followUp,
    expected_updated_at: p.updated_at,
  });
  const canComplete =
    completion.success &&
    period === p.evaluation_period_id &&
    e?.population.auditStatus === "audited" &&
    e.verdict !== null;
  const periodPicker = (
    <Field label="Periode evaluasi">
      <select
        className={selectClass}
        value={period}
        disabled={locked || !options.length}
        onChange={(event) => setPeriod(event.target.value)}
      >
        {!options.length && <option value="">Belum ada periode</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {new Date(o.year, o.month - 1).toLocaleDateString("id-ID", {
              month: "long",
              year: "numeric",
            })}
            {o.auditStatus === "no_audit" ? " — belum ada audit" : ""}
          </option>
        ))}
      </select>
    </Field>
  );
  if (p.status !== "aktif" && !evaluating && !completed) return null;
  return (
    <section
      aria-label="Evaluasi rencana"
      className="space-y-6 border-t border-border pt-6"
    >
      <h2 className="font-heading text-xl font-bold">
        {completed ? "Hasil evaluasi beku" : "Evaluasi pasca-training"}
      </h2>
      {p.status === "aktif" &&
        (!p.evaluation_due ? (
          <p className="text-sm">
            Evaluasi dijadwalkan {p.evaluation_due_date} (WIB).
          </p>
        ) : (
          <div className="space-y-3">
            {!options.length && (
              <p className="text-sm">
                Belum ada periode evaluasi yang tersedia
              </p>
            )}
            <Button
              className="min-h-[44px]"
              disabled={locked || !options.length}
              onClick={() => setConfirm("start")}
            >
              Mulai evaluasi
            </Button>
          </div>
        ))}
      {evaluating && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">{periodPicker}</div>
          <Button
            className="min-h-[44px]"
            variant="outline"
            disabled={locked || !period || period === p.evaluation_period_id}
            onClick={() =>
              mutation.run(async () => {
                await tnaResponse(
                  rpcClient.v1.tna.plans[":id"].evaluation.$patch(
                    { param: { id: p.id } },
                    {
                      init: {
                        body: JSON.stringify({
                          evaluation_period_id: period,
                          expected_updated_at: p.updated_at,
                        }),
                      },
                    },
                  ),
                );
                await reload();
              }, "Periode evaluasi diperbarui")
            }
          >
            Ganti periode
          </Button>
        </div>
      )}
      {(evaluating || completed) && !e && (
        <p role="alert" className="text-sm">
          Hasil evaluasi belum tersedia. Muat ulang sebelum melanjutkan.
        </p>
      )}
      {e && (evaluating || completed) && (
        <>
          <p className="text-sm text-muted-foreground">
            {completed
              ? "Angka dan narasi dibekukan saat penyelesaian."
              : "Pratinjau live — angka dapat berubah sampai rencana diselesaikan."}{" "}
            Dihitung pada{" "}
            {new Date(e.computed_at).toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
            })}{" "}
            (WIB).
          </p>
          <div className="space-y-4">
            <h3 className="font-semibold">Populasi evaluasi</h3>
            <Metrics metrics={e.population} />
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Target tingkat</dt>
                <dd>
                  ≤ {number(p.target_max_rate_per_100)} per 100 sesi sampel ·{" "}
                  {e.population.ratePer100 === null
                    ? "Belum tersedia"
                    : e.population.ratePer100 <= p.target_max_rate_per_100
                      ? "Tercapai"
                      : "Belum tercapai"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Target sebaran</dt>
                <dd>
                  ≤ {number(p.target_max_spread_pct)}% ·{" "}
                  {e.population.spreadPct === null
                    ? "Belum tersedia"
                    : e.population.spreadPct <= p.target_max_spread_pct
                      ? "Tercapai"
                      : "Belum tercapai"}
                </dd>
              </div>
            </dl>
            {e.verdict && (
              <p className="text-sm font-semibold">
                Verdict: {verdictLabels[e.verdict]}
              </p>
            )}
            {e.population.insufficientData && (
              <p className="text-sm text-muted-foreground">
                Data periode evaluasi belum cukup untuk kesimpulan kuat.
              </p>
            )}
            {(e.baseline_recompute_drift.findings !== 0 ||
              e.baseline_recompute_drift.auditedAgents !== 0) && (
              <p role="status" className="text-sm">
                Data QA periode baseline berubah sejak aktivasi
              </p>
            )}
          </div>
          <section
            className="space-y-4"
            aria-label="Kohort peserta dan pembanding"
          >
            <h3 className="font-semibold">Peserta vs kelompok pembanding</h3>
            <p className="max-w-[70ch] text-sm text-muted-foreground">
              Perbandingan ini indikatif, bukan bukti sebab-akibat. Kohort
              baseline dihitung ulang; verdict target memakai baseline beku.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              {(
                [
                  ["Peserta", e.cohorts.participants],
                  ["Kelompok pembanding", e.cohorts.comparison],
                ] as const
              ).map(([label, c]) => (
                <div key={label} className="space-y-2">
                  <h4 className="text-sm font-semibold">{label}</h4>
                  <Cohort label="Baseline" metrics={c.baseline} />
                  <Cohort label="Evaluasi" metrics={c.evaluation} />
                  <p className="text-sm">
                    Delta tingkat: {number(c.delta)} per 100 sesi sampel
                  </p>
                </div>
              ))}
            </div>
            {e.cohorts.comparison_small ? (
              <p className="text-sm">
                Kelompok pembanding terlalu kecil untuk dibandingkan.
              </p>
            ) : (
              e.cohorts.net_effect !== null && (
                <p className="text-sm">
                  Efek bersih: {number(e.cohorts.net_effect)} per 100 sesi
                  sampel
                </p>
              )
            )}
          </section>
          <section className="space-y-4" aria-label="Evaluasi per peserta">
            <h3 className="font-semibold">Evaluasi per peserta</h3>
            <Field label="Urutkan peserta">
              <select
                className={`${selectClass} sm:max-w-xs`}
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
              >
                <option value="name">Nama</option>
                <option value="findings">Temuan evaluasi terbanyak</option>
              </select>
            </Field>
            <table
              className="block w-full text-left text-sm md:table"
              aria-label="Hasil evaluasi per peserta"
            >
              <thead className="hidden md:table-header-group">
                <tr className="border-b border-border">
                  {[
                    "Peserta",
                    "Baseline (temuan / sesi)",
                    "Evaluasi (temuan / sesi)",
                    "Sumber baseline sesi",
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="py-3 pr-4 font-semibold"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="block space-y-4 md:table-row-group md:space-y-0">
                {participantResults.map((a) => (
                  <tr
                    key={a.participant_id}
                    className="grid gap-3 rounded-xl border border-border p-4 md:table-row md:rounded-none md:border-0 md:border-b md:p-0"
                  >
                    <th scope="row" className="font-semibold md:py-4 md:pr-4">
                      {participantNames.get(a.participant_id) ??
                        "Profil tidak tersedia"}
                    </th>
                    <td className="md:py-4 md:pr-4">
                      <span className="md:sr-only">
                        Baseline (temuan / sesi):{" "}
                      </span>
                      {number(a.baseline_findings)} /{" "}
                      {number(a.baseline_sessions)}
                    </td>
                    <td className="md:py-4 md:pr-4">
                      {a.audited_in_eval ? (
                        <>
                          <span className="md:sr-only">
                            Evaluasi (temuan / sesi):{" "}
                          </span>
                          {number(a.eval_findings)} / {number(a.eval_sessions)}
                        </>
                      ) : (
                        "Tidak diaudit"
                      )}
                    </td>
                    <td className="text-muted-foreground md:py-4">
                      {a.baseline_sessions_source === "frozen"
                        ? "Sesi baseline beku"
                        : a.baseline_sessions_source === "recomputed"
                          ? "Sesi baseline dihitung ulang"
                          : "Sesi baseline belum tersedia"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!d.participant_evaluation?.length && (
              <p className="text-sm">Belum ada hasil per peserta.</p>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="font-heading text-lg font-bold">
              Ringkasan Evaluasi
            </h3>
            <p className="max-w-[70ch] whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {d.evaluation_narrative ?? "Narasi evaluasi belum tersedia."}
            </p>
          </section>
        </>
      )}
      {evaluating && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canComplete && !locked) setConfirm("complete");
          }}
        >
          <Field label="Kesimpulan evaluasi">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              minLength={10}
              maxLength={2000}
              required
              disabled={locked}
              aria-describedby="conclusion-help"
            />
          </Field>
          <p id="conclusion-help" className="text-sm text-muted-foreground">
            Wajib 10–2.000 karakter. Hasil dihitung ulang oleh server saat
            penyelesaian.
          </p>
          <Field label="Tindak lanjut">
            <select
              className={selectClass}
              value={followUp}
              disabled={locked}
              onChange={(event) =>
                setFollowUp(event.target.value as TnaFollowUp)
              }
            >
              {Object.entries(followUpLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {period !== p.evaluation_period_id && (
            <p className="text-sm">
              Simpan pilihan dengan Ganti periode sebelum menyelesaikan.
            </p>
          )}
          {e?.population.auditStatus === "no_audit" && (
            <p className="text-sm">
              Belum ada audit pada periode evaluasi. Pilih periode lain sebelum
              menyelesaikan.
            </p>
          )}
          <Button
            type="submit"
            className="min-h-[44px]"
            disabled={locked || !canComplete}
          >
            Selesaikan
          </Button>
        </form>
      )}
      {completed && (
        <div className="space-y-3 text-sm">
          <p className="max-w-[70ch] whitespace-pre-wrap">
            Kesimpulan: {p.conclusion_note}
          </p>
          <p>
            Tindak lanjut:{" "}
            {p.follow_up ? followUpLabels[p.follow_up] : "Belum tersedia"}
          </p>
          {p.follow_up === "perlu_rencana_lanjutan" &&
            p.evaluation_period_id && <FollowUpLink detail={d} />}
        </div>
      )}
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.busy) setConfirm(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>
            {confirm === "start" ? "Mulai evaluasi?" : "Selesaikan rencana?"}
          </DialogTitle>
          <DialogDescription>
            {confirm === "start"
              ? "Pilih periode setelah bulan pelatihan. Pratinjau tetap live sampai rencana diselesaikan."
              : "Hasil evaluasi dan peserta akan dibekukan. Rencana selesai tidak dapat diubah."}
          </DialogDescription>
          {confirm === "start" && periodPicker}
          <DialogFooter>
            <Button
              className="min-h-[44px]"
              variant="outline"
              disabled={mutation.busy}
              onClick={() => setConfirm(null)}
            >
              Kembali
            </Button>
            <Button
              className="min-h-[44px]"
              disabled={
                locked || (confirm === "start" ? !period : !canComplete)
              }
              onClick={() =>
                mutation.run(
                  async () => {
                    try {
                      if (confirm === "start") {
                        await tnaResponse(
                          rpcClient.v1.tna.plans[":id"][
                            "start-evaluation"
                          ].$post(
                            { param: { id: p.id } },
                            {
                              init: {
                                body: JSON.stringify({
                                  evaluation_period_id: period,
                                  expected_updated_at: p.updated_at,
                                }),
                              },
                            },
                          ),
                        );
                      } else if (completion.success) {
                        await tnaResponse(
                          rpcClient.v1.tna.plans[":id"].complete.$post(
                            { param: { id: p.id } },
                            { init: { body: JSON.stringify(completion.data) } },
                          ),
                        );
                      }
                      await reload();
                    } finally {
                      setConfirm(null);
                    }
                  },
                  confirm === "start"
                    ? "Evaluasi dimulai"
                    : "Rencana diselesaikan",
                )
              }
            >
              {mutation.busy
                ? "Memproses…"
                : confirm === "start"
                  ? "Ya, mulai evaluasi"
                  : "Ya, selesaikan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Cohort({
  label,
  metrics: m,
}: {
  label: string;
  metrics: TnaCohortMetrics;
}) {
  return (
    <p className="text-sm">
      {label}: {m.agents} agent · {m.findings} temuan / {m.sampledSessions} sesi
      · tingkat {number(m.ratePer100)} per 100 sesi sampel · sebaran{" "}
      {number(m.spreadPct)}%
    </p>
  );
}

function FollowUpLink({ detail: d }: { detail: TnaPlanDetail }) {
  const need = useApi<TnaNeedDetail>(`/tna/needs/${d.plan.need_id}`);
  return (
    <>
      <State loading={need.loading} error={need.error} retry={need.refetch} />
      {!need.loading && !need.error && need.data && (
        <Link
          to="/tna/parameter"
          search={{
            service: need.data.need.service_type,
            period: d.plan.evaluation_period_id!,
            indicator: need.data.need.indicator_id,
            compare: need.data.need.compare_count,
            previous_plan: d.plan.id,
          }}
          className="inline-flex min-h-[44px] items-center underline underline-offset-4"
        >
          Validasi ulang parameter
        </Link>
      )}
    </>
  );
}
