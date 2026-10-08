import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  VALID_SERVICE_TYPES,
  type ServiceType,
  type QAPeriod,
  type TnaParametersResponse,
  type TnaNeed,
  type TnaPlan,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import QaStatePanel from "../../components/ui/QaStatePanel";
import { Surface, Field, State, Metrics } from "./shared";
import {
  trend,
  interventionLabels,
  planStatusLabels,
  selectClass,
} from "./utils";
import { SERVICE_LABELS } from "../../lib/scoring";

export default function TnaIndex() {
  const search = useSearch({ from: "/tna" });
  const navigate = useNavigate();
  const periods = useApi<QAPeriod[]>("/sidak/periods");
  const period = search.period || periods.data?.[0]?.id || "";
  const query = new URLSearchParams({
    service_type: search.service,
    period_id: period,
    compare_count: String(search.compare),
    scope: search.all ? "all" : "candidates",
  });
  const parameters = useApi<TnaParametersResponse>(
    period ? `/tna/parameters?${query}` : null,
  );
  const needs = useApi<{ items: TnaNeed[] }>(
    period
      ? `/tna/needs?service_type=${search.service}&period_id=${period}`
      : null,
  );
  const plans = useApi<{ items: TnaPlan[] }>("/tna/plans");
  const update = (next: Partial<typeof search>) =>
    navigate({
      to: "/tna",
      search: { ...search, period, ...next },
      replace: true,
    });
  return (
    <Surface
      title="TNA"
      description="Temukan parameter yang perlu ditindaklanjuti, validasi penyebab, lalu susun rencana pelatihan. Tingkat dihitung per 100 sesi sampel, bukan persentase tiket."
    >
      <section aria-label="Filter parameter" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Layanan">
            <select
              className={selectClass}
              value={search.service}
              onChange={(e) =>
                update({ service: e.target.value as ServiceType })
              }
            >
              {VALID_SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {SERVICE_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Periode">
            <select
              className={selectClass}
              value={period}
              onChange={(e) => update({ period: e.target.value })}
            >
              <option value="" disabled>
                Pilih periode
              </option>
              {periods.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {new Date(p.year, p.month - 1).toLocaleDateString("id-ID", {
                    month: "long",
                    year: "numeric",
                  })}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jumlah pembanding">
            <select
              className={selectClass}
              value={search.compare}
              onChange={(e) => update({ compare: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} periode
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex min-h-[44px] items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={search.all}
            onChange={(e) => update({ all: e.target.checked })}
            className="size-5 accent-foreground"
          />
          Tampilkan semua parameter
        </label>
      </section>
      <State
        loading={periods.loading || parameters.loading}
        error={periods.error || parameters.error}
        retry={() => {
          periods.refetch();
          parameters.refetch();
        }}
      />
      {!periods.loading && !periods.error && periods.data?.length === 0 && (
        <QaStatePanel
          type="empty"
          title="Belum ada periode QA"
          description="Tambahkan periode dan audit di SIDAK untuk memulai analisis."
        />
      )}
      {!parameters.loading && !parameters.error && parameters.data && (
        <section className="space-y-4" aria-label="Daftar parameter">
          {parameters.data.selected_audit_status === "no_audit" && (
            <QaStatePanel
              className="text-foreground!"
              type="warning"
              title="Belum ada audit untuk layanan dan periode ini"
              description="Tingkat dan sebaran belum dapat dihitung. Parameter berasal dari periode pembanding."
            />
          )}
          {parameters.data.items.length > 0 &&
            parameters.data.insufficientData &&
            parameters.data.selected_audit_status !== "no_audit" && (
              <p className="text-sm text-muted-foreground">
                Data belum cukup untuk kesimpulan kuat.
              </p>
            )}
          {!parameters.data.items.length && (
            <QaStatePanel
              type="empty"
              title="Tidak ada parameter untuk filter ini"
              description="Coba tampilkan semua parameter atau ganti layanan dan periode."
            />
          )}
          {parameters.data.items.map((m) => (
            <article
              key={m.indicatorId}
              className="space-y-4 border-b border-border py-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/tna/parameter"
                  search={{
                    service: search.service,
                    period,
                    indicator: m.indicatorId,
                    compare: search.compare,
                  }}
                  className="inline-flex min-h-[44px] items-center font-heading text-lg font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2"
                >
                  {m.parameterName}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {m.isCandidate ? "Kandidat" : "Bukan kandidat"}
                </span>
                {m.signals.map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-border px-2 py-1 text-xs text-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
              <Metrics metrics={m} />
              <p className="text-sm text-muted-foreground">{trend(m)}</p>
              <p className="text-sm">
                Saran intervensi: {interventionLabels[m.suggestedIntervention]}
              </p>
            </article>
          ))}
        </section>
      )}
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold">
          Kebutuhan & rencana terbaru
        </h2>
        <State
          loading={needs.loading || plans.loading}
          error={needs.error || plans.error}
          retry={() => {
            needs.refetch();
            plans.refetch();
          }}
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-semibold">Kebutuhan</h3>
            {needs.data?.items.slice(0, 10).map((n) => (
              <p key={n.id}>
                <Link
                  className="inline-flex min-h-[44px] items-center text-sm underline underline-offset-4"
                  to="/tna/kebutuhan/$id"
                  params={{ id: n.id }}
                >
                  {n.validation_snapshot.parameterName} —{" "}
                  {n.outcome === "training"
                    ? "Pelatihan"
                    : "Eskalasi non-pelatihan"}
                </Link>
              </p>
            ))}
            {needs.data?.items.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Belum ada kebutuhan tervalidasi.
              </p>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold">Rencana</h3>
            {plans.data?.items.slice(0, 10).map((p) => (
              <p key={p.id}>
                <Link
                  className="inline-flex min-h-[44px] items-center text-sm underline underline-offset-4"
                  to="/tna/rencana/$id"
                  params={{ id: p.id }}
                >
                  {p.title} — {planStatusLabels[p.status]}
                </Link>
              </p>
            ))}
            {plans.data?.items.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Belum ada rencana.
              </p>
            )}
          </div>
        </div>
      </section>
    </Surface>
  );
}
