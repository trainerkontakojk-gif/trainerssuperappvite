import { Link, useNavigate, useParams } from "@tanstack/react-router";
import type {
  CreateTnaPlan,
  TnaNeedDetail,
  TnaParameterDetail,
  TnaProgram,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import { rpcClient } from "../../lib/api/rpc-client";
import { Surface, State, Metrics, MutationState } from "./shared";
import {
  clusterLabels,
  planStatusLabels,
  useTnaMutation,
  parameterQuery,
  tnaResponse,
} from "./utils";
import { PlanForm } from "./PlanForm";

export default function TnaNeedPage() {
  const { id } = useParams({ from: "/tna/kebutuhan/$id" });
  const response = useApi<TnaNeedDetail>(`/tna/needs/${id}`);
  return (
    <Surface
      title="Kebutuhan pelatihan"
      description="Snapshot saat validasi disimpan terpisah dari baseline saat aktivasi."
    >
      <State
        loading={response.loading}
        error={response.error}
        retry={response.refetch}
      />
      {!response.loading && !response.error && response.data && (
        <NeedContent
          key={id}
          detail={response.data}
          reload={response.refetch}
        />
      )}
    </Surface>
  );
}
function NeedContent({
  detail: { need, plans },
  reload,
}: {
  detail: TnaNeedDetail;
  reload: () => unknown;
}) {
  const navigate = useNavigate();
  const mutation = useTnaMutation();
  const openPlan = plans.find((p) => p.status !== "dibatalkan");
  const canCreate = need.outcome === "training" && !openPlan;
  const parameter = useApi<TnaParameterDetail>(
    canCreate
      ? `/tna/parameters/detail?${parameterQuery(need.service_type, need.period_id, need.indicator_id, need.compare_count)}`
      : null,
  );
  const catalog = useApi<TnaProgram[]>(canCreate ? "/tna/programs" : null);
  const suggestions =
    catalog.data?.filter(
      (p) =>
        p.trigger_clusters.includes(need.validated_cluster_id) ||
        p.service_types.includes(need.service_type),
    ) ?? [];
  const initial: CreateTnaPlan = {
    need_id: need.id,
    program_id: suggestions[0]?.id ?? catalog.data?.[0]?.id ?? "",
    title: "",
    intervention_type: need.validation_snapshot.suggestedIntervention,
    start_date: "",
    end_date: "",
    evaluation_due_date: "",
    target_max_rate_per_100: 0,
    target_max_spread_pct: 0,
    participant_peserta_ids:
      parameter.data?.affected_agents.map((a) => a.peserta_id) ?? [],
  };
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold">
          {need.validation_snapshot.parameterName}
        </h2>
        <Metrics metrics={need.validation_snapshot} />
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Penyebab tervalidasi</dt>
            <dd>{clusterLabels[need.validated_cluster_id]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Catatan trainer</dt>
            <dd className="max-w-[70ch] whitespace-pre-wrap break-words">
              {need.cause_note}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Jenis gap</dt>
            <dd>
              {
                {
                  knowledge: "Pengetahuan",
                  skill: "Keterampilan",
                  proses: "Proses",
                  perilaku: "Perilaku",
                }[need.gap_type]
              }
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Keputusan</dt>
            <dd>
              {need.outcome === "training"
                ? "Pelatihan"
                : "Eskalasi non-pelatihan — tidak dibuatkan rencana pelatihan"}
            </dd>
          </div>
        </dl>
      </section>
      {plans.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-bold">Rencana terkait</h2>
          {plans.map((p) => (
            <p key={p.id}>
              <Link
                className="text-sm underline underline-offset-4"
                to="/tna/rencana/$id"
                params={{ id: p.id }}
              >
                {p.title} — {planStatusLabels[p.status]}
              </Link>
            </p>
          ))}
        </section>
      )}
      <MutationState
        mutation={mutation}
        reload={() => {
          mutation.reset();
          reload();
        }}
      />
      {canCreate && (
        <section className="space-y-4">
          <h2 className="font-heading text-xl font-bold">Susun rencana</h2>
          <State
            loading={parameter.loading || catalog.loading}
            error={parameter.error || catalog.error}
            retry={() => {
              parameter.refetch();
              catalog.refetch();
            }}
          />
          {parameter.data &&
            catalog.data &&
            !parameter.loading &&
            !catalog.loading &&
            !parameter.error &&
            !catalog.error && (
              <>
                <div className="space-y-2">
                  <h3 className="font-semibold">Saran program</h3>
                  {suggestions.length ? (
                    suggestions.map((p) => (
                      <p key={p.id} className="text-sm">
                        {p.name} — {p.description}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Belum ada saran khusus. Pilih program aktif dari katalog.
                    </p>
                  )}
                </div>
                <PlanForm
                  initial={initial}
                  programs={catalog.data}
                  participants={parameter.data.affected_agents.map((a) => ({
                    id: a.peserta_id,
                    name: a.nama ?? "Nama tidak tersedia",
                  }))}
                  busy={mutation.busy}
                  disabled={mutation.conflict}
                  onSave={(values) =>
                    mutation.run(async () => {
                      const p = await tnaResponse(
                        rpcClient.v1.tna.plans.$post({ json: values }),
                      );
                      await navigate({
                        to: "/tna/rencana/$id",
                        params: { id: p.id },
                      });
                    }, "Rencana dibuat")
                  }
                />
              </>
            )}
        </section>
      )}
    </div>
  );
}
