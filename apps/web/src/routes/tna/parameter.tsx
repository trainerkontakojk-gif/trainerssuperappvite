import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import {
  createTnaNeedSchema,
  type TnaParameterDetail,
  type QAPeriod,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import { rpcClient } from "../../lib/api/rpc-client";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import QaStatePanel from "../../components/ui/QaStatePanel";
import { Surface, State, Metrics, Field, MutationState } from "./shared";
import {
  trend,
  selectClass,
  clusterLabels,
  useTnaMutation,
  parameterQuery,
  interventionLabels,
  tnaResponse,
} from "./utils";

export default function TnaParameter() {
  const search = useSearch({ from: "/tna/parameter" });
  const response = useApi<TnaParameterDetail>(
    `/tna/parameters/detail?${parameterQuery(search.service, search.period, search.indicator, search.compare)}`,
  );
  return (
    <Surface
      title={response.data?.metrics.parameterName ?? "Detail parameter"}
      description="Baca data dan sampel tiket sebelum memvalidasi kebutuhan pelatihan."
    >
      <State
        loading={response.loading}
        error={response.error}
        retry={response.refetch}
      />
      {!response.loading && !response.error && response.data && (
        <ParameterContent
          key={`${search.service}/${search.period}/${search.indicator}/${search.compare}`}
          detail={response.data}
        />
      )}
    </Surface>
  );
}
function ParameterContent({ detail: d }: { detail: TnaParameterDetail }) {
  const navigate = useNavigate();
  const periods = useApi<QAPeriod[]>("/sidak/periods");
  const search = useSearch({ from: "/tna/parameter" });
  const mutation = useTnaMutation();
  const [invalid, setInvalid] = useState(false);
  const noFindings =
    d.metrics.auditStatus === "no_audit" || d.metrics.findings === 0;
  return (
    <div className="space-y-8">
      {!d.metrics.isCandidate && (
        <QaStatePanel
          className="text-foreground!"
          type="warning"
          title="Parameter ini bukan kandidat otomatis"
          description="Trainer tetap dapat memvalidasi bila ada temuan yang perlu ditindaklanjuti."
        />
      )}
      <section className="space-y-4">
        <Metrics metrics={d.metrics} />
        <p className="text-sm">
          Saran intervensi:{" "}
          {interventionLabels[d.metrics.suggestedIntervention]}
        </p>
        <p className="text-sm text-muted-foreground">{trend(d.metrics)}</p>
        {d.metrics.insufficientData && (
          <p className="text-sm text-muted-foreground">
            Data belum cukup untuk kesimpulan kuat.
          </p>
        )}
        <h2 className="font-heading text-lg font-bold">Periode pembanding</h2>
        {d.metrics.comparePeriods.map((p, index) => (
          <div
            key={p.periodId}
            className="space-y-2 border-b border-border py-3"
          >
            <p className="text-sm">
              {(() => {
                const period = periods.data?.find(
                  (item) => item.id === p.periodId,
                );
                return period
                  ? new Date(period.year, period.month - 1).toLocaleDateString(
                      "id-ID",
                      { month: "long", year: "numeric" },
                    )
                  : `Periode pembanding ${index + 1}`;
              })()}
            </p>
            <Metrics metrics={p} />
          </div>
        ))}
        {!d.metrics.comparePeriods.length && (
          <p className="text-sm text-muted-foreground">
            Belum ada periode pembanding.
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Agent terdampak</h2>
        {d.affected_agents.map((a) => (
          <p key={a.peserta_id} className="text-sm">
            {a.nama ?? "Nama tidak tersedia"} · {a.tim ?? "Tanpa tim"} ·{" "}
            {a.findings} temuan
          </p>
        ))}
        {!d.affected_agents.length && (
          <p className="text-sm text-muted-foreground">
            Tidak ada agent terdampak.
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Klaster penyebab</h2>
        <p className="text-sm text-muted-foreground">
          Dugaan otomatis — validasi dengan membaca sampel tiket.
        </p>
        {d.clusters.map((c) => (
          <div
            key={c.clusterId}
            className="space-y-1 border-b border-border py-3"
          >
            <h3 className="font-semibold">{c.label}</h3>
            <p className="text-sm">
              {c.findingsCount} temuan · {c.affectedTickets} tiket
            </p>
            <p className="max-w-[70ch] text-sm text-muted-foreground">
              {c.recommendation}
            </p>
          </div>
        ))}
        {!d.clusters.length && (
          <p className="text-sm text-muted-foreground">
            Belum ada klaster penyebab.
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Sampel tiket</h2>
        {d.sample_tickets.map((t) => (
          <article
            key={t.id}
            className="space-y-2 border-b border-border py-3 text-sm"
          >
            <h3 className="font-semibold break-words">{t.no_tiket}</h3>
            <p className="max-w-[70ch] break-words">
              Ketidaksesuaian: {t.ketidaksesuaian ?? "Tidak tersedia"}
            </p>
            <p className="max-w-[70ch] break-words text-muted-foreground">
              Sebaiknya: {t.sebaiknya ?? "Tidak tersedia"}
            </p>
          </article>
        ))}
        {!d.sample_tickets.length && (
          <p className="text-sm text-muted-foreground">
            Tidak ada sampel tiket.
          </p>
        )}
      </section>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fields = new FormData(e.currentTarget);
          const parsed = createTnaNeedSchema.safeParse({
            service_type: search.service,
            period_id: search.period,
            indicator_id: search.indicator,
            compare_count: search.compare,
            validated_cluster_id: fields.get("cluster"),
            cause_note: fields.get("note"),
            gap_type: fields.get("gap"),
            outcome: fields.get("outcome"),
          });
          setInvalid(!parsed.success);
          if (parsed.success)
            mutation.run(async () => {
              const need = await tnaResponse(
                rpcClient.v1.tna.needs.$post({ json: parsed.data }),
              );
              await navigate({
                to: "/tna/kebutuhan/$id",
                params: { id: need.id },
              });
            }, "Validasi tersimpan");
        }}
      >
        <h2 className="font-heading text-xl font-bold">Validasi kebutuhan</h2>
        {noFindings && (
          <QaStatePanel
            className="text-foreground!"
            type="warning"
            title="Validasi belum tersedia"
            description="Validasi membutuhkan audit dengan minimal satu temuan."
          />
        )}
        <fieldset
          disabled={mutation.busy || mutation.conflict || noFindings}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Penyebab tervalidasi">
              <select
                name="cluster"
                className={selectClass}
                defaultValue={d.clusters[0]?.clusterId ?? "lainnya"}
              >
                {Object.entries(clusterLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Jenis gap">
              <select name="gap" className={selectClass} defaultValue="skill">
                <option value="knowledge">Pengetahuan</option>
                <option value="skill">Keterampilan</option>
                <option value="proses">Proses</option>
                <option value="perilaku">Perilaku</option>
              </select>
            </Field>
          </div>
          <Field label="Catatan penyebab">
            <Textarea
              name="note"
              required
              minLength={10}
              maxLength={2000}
              placeholder="Jelaskan penyebab berdasarkan sampel tiket (minimal 10 karakter)"
            />
          </Field>
          <Field label="Keputusan">
            <select name="outcome" className={selectClass}>
              <option value="training">Pelatihan</option>
              <option value="eskalasi_non_training">
                Eskalasi non-pelatihan
              </option>
            </select>
          </Field>
        </fieldset>
        {invalid && (
          <p role="alert" className="text-sm text-destructive">
            Periksa penyebab, jenis gap, dan catatan minimal 10 karakter.
          </p>
        )}
        <MutationState
          mutation={mutation}
          reload={() => {
            mutation.reset();
            responseReload();
          }}
        />
        <Button
          className="min-h-[44px]"
          type="submit"
          disabled={mutation.busy || mutation.conflict || noFindings}
        >
          {mutation.busy ? "Menyimpan…" : "Simpan validasi"}
        </Button>
      </form>
    </div>
  );
}
function responseReload() {
  window.location.reload();
}
