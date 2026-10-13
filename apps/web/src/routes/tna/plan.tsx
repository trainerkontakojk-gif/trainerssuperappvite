import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type {
  CreateTnaPlan,
  TnaPlanDetail,
  UpdateTnaDraftPlan,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import { rpcClient } from "../../lib/api/rpc-client";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import { Surface, State, Metrics, MutationState } from "./shared";
import {
  number,
  interventionLabels,
  planStatusLabels,
  useTnaMutation,
  tnaResponse,
} from "./utils";
import { PlanForm } from "./PlanForm";
import { Evaluation } from "./Evaluation";
import { Textarea } from "../../components/ui/textarea";
import { Field } from "./shared";

export default function TnaPlanPage() {
  const { id } = useParams({ from: "/tna/rencana/$id" });
  const response = useApi<TnaPlanDetail>(`/tna/plans/${id}`);
  return (
    <Surface
      title={response.data?.plan.title ?? "Rencana pelatihan"}
      description="Baseline dihitung ulang dan dibekukan oleh server saat rencana diaktifkan."
    >
      <State
        loading={response.loading}
        error={response.error}
        retry={response.refetch}
      />
      {!response.loading && !response.error && response.data && (
        <PlanContent
          key={`${id}/${response.data.plan.updated_at}/${response.data.plan.status}`}
          detail={response.data}
          reload={response.refetch}
        />
      )}
    </Surface>
  );
}
function PlanContent({
  detail: d,
  reload,
}: {
  detail: TnaPlanDetail;
  reload: () => Promise<void>;
}) {
  const mutation = useTnaMutation();
  const mutationPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mutation.error)
      mutationPanel.current?.scrollIntoView({ block: "center" });
  }, [mutation.error]);
  const [confirm, setConfirm] = useState<"activate" | "cancel" | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const p = d.plan;
  const draft = p.status === "draft";
  const baseline = draft ? d.preview : p.baseline_snapshot;
  const initial: CreateTnaPlan = {
    need_id: p.need_id,
    program_id: p.program_id,
    title: p.title,
    intervention_type: p.intervention_type,
    start_date: p.start_date,
    end_date: p.end_date,
    evaluation_due_date: p.evaluation_due_date,
    target_max_rate_per_100: p.target_max_rate_per_100,
    target_max_spread_pct: p.target_max_spread_pct,
    participant_peserta_ids: d.participants.flatMap((a) =>
      a.peserta_id ? [a.peserta_id] : [],
    ),
  };
  return (
    <div className="space-y-8">
      <p className="text-sm font-medium">
        Status: {planStatusLabels[p.status]}
      </p>
      <div ref={mutationPanel}>
        <MutationState
          mutation={mutation}
          reload={async () => {
            mutation.reset();
            await reload();
          }}
        />
      </div>
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold">
          {draft
            ? "Pratinjau — belum dibekukan"
            : baseline
              ? "Baseline beku"
              : "Baseline belum dibekukan"}
        </h2>
        {baseline ? (
          <>
            <Metrics metrics={baseline} />
            <p className="text-sm text-muted-foreground">
              Dihitung pada{" "}
              {new Date(baseline.computed_at).toLocaleString("id-ID")}.{" "}
              {draft
                ? "Angka dapat berubah sebelum aktivasi."
                : "Angka tidak berubah setelah aktivasi."}
            </p>
            {baseline.insufficientData && (
              <p className="text-sm text-muted-foreground">
                Data belum cukup untuk kesimpulan kuat.
              </p>
            )}
            {(baseline.validation_drift.findings !== 0 ||
              baseline.validation_drift.auditedAgents !== 0) && (
              <p role="status" className="text-sm">
                Data QA berubah sejak validasi.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Rencana dibatalkan sebelum aktivasi; baseline belum dibekukan.
          </p>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold">
          {draft ? "Edit rencana" : "Rencana dan peserta terkunci"}
        </h2>
        {draft ? (
          <PlanForm
            initial={initial}
            programs={[]}
            participants={d.participants.flatMap((a) =>
              a.peserta_id
                ? [{ id: a.peserta_id, name: a.peserta_name_snapshot }]
                : [],
            )}
            busy={mutation.busy}
            disabled={mutation.conflict}
            editing
            onSave={(values) =>
              mutation.run(async () => {
                const {
                  need_id: _need,
                  program_id: _program,
                  ...fields
                } = values;
                await tnaResponse(
                  rpcClient.v1.tna.plans[":id"].$patch(
                    { param: { id: p.id } },
                    {
                      init: {
                        body: JSON.stringify({
                          ...fields,
                          expected_updated_at: p.updated_at,
                        } satisfies UpdateTnaDraftPlan),
                      },
                    },
                  ),
                );
                await reload();
              })
            }
          />
        ) : (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Intervensi</dt>
              <dd>{interventionLabels[p.intervention_type]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Jadwal</dt>
              <dd>
                {p.start_date} – {p.end_date}; evaluasi {p.evaluation_due_date}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target tingkat maksimal</dt>
              <dd>{number(p.target_max_rate_per_100)} per 100 sesi sampel</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target sebaran maksimal</dt>
              <dd>{number(p.target_max_spread_pct)}%</dd>
            </div>
          </dl>
        )}
        <h3 className="font-semibold">
          {draft ? "Pratinjau temuan per peserta" : "Peserta saat aktivasi"}
        </h3>
        {d.participants.map((a) => {
          const findings = draft
            ? (d.participant_preview?.find((b) => b.peserta_id === a.peserta_id)
                ?.baseline_findings ?? null)
            : a.baseline_findings;
          return (
            <p key={a.id} className="text-sm">
              {a.peserta_name_snapshot} · {a.team_snapshot ?? "Tanpa tim"} ·{" "}
              {findings === null
                ? "Temuan belum tersedia"
                : `${findings} temuan`}
              {!a.peserta_id && " · Profil peserta sudah tidak tersedia"}
            </p>
          );
        })}
      </section>
      <section className="space-y-3">
        <h2 className="font-heading text-xl font-bold">Ringkasan TNA</h2>
        <p className="max-w-[70ch] whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
          {d.narrative}
        </p>
      </section>
      <Evaluation detail={d} mutation={mutation} reload={reload} />
      {p.cancel_reason && (
        <p className="max-w-[70ch] whitespace-pre-wrap text-sm">
          Alasan pembatalan: {p.cancel_reason}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {draft && (
          <Button
            className="min-h-[44px]"
            disabled={mutation.busy || mutation.conflict}
            onClick={() => setConfirm("activate")}
          >
            Aktifkan
          </Button>
        )}
        {(draft || p.status === "aktif" || p.status === "evaluasi") && (
          <Button
            className="min-h-[44px]"
            variant="outline"
            disabled={mutation.busy || mutation.conflict}
            onClick={() => setConfirm("cancel")}
          >
            Batalkan
          </Button>
        )}
      </div>
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.busy) setConfirm(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>
            {confirm === "activate" ? "Aktifkan rencana?" : "Batalkan rencana?"}
          </DialogTitle>
          <DialogDescription>
            {confirm === "activate"
              ? "Baseline dan peserta akan dibekukan berdasarkan data QA terbaru. Pastikan perubahan draft sudah disimpan."
              : "Rencana tidak dapat dilanjutkan setelah dibatalkan. Baseline yang sudah beku tetap tersimpan."}
          </DialogDescription>
          {confirm === "cancel" && !draft && (
            <Field label="Alasan pembatalan">
              <Textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                minLength={10}
                maxLength={1000}
                required
                disabled={mutation.busy}
                aria-describedby="cancel-help"
              />
              <p id="cancel-help" className="text-sm text-muted-foreground">
                Wajib 10–1.000 karakter.
              </p>
            </Field>
          )}
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
                mutation.busy ||
                mutation.conflict ||
                (confirm === "cancel" &&
                  !draft &&
                  cancelReason.trim().length < 10)
              }
              onClick={() => {
                const action = confirm;
                if (!action) return;
                mutation.run(
                  async () => {
                    try {
                      await tnaResponse(
                        rpcClient.v1.tna.plans[":id"][action].$post(
                          { param: { id: p.id } },
                          {
                            init: {
                              body: JSON.stringify({
                                expected_updated_at: p.updated_at,
                                ...(action === "cancel" && !draft
                                  ? { cancel_reason: cancelReason.trim() }
                                  : {}),
                              }),
                            },
                          },
                        ),
                      );
                      await reload();
                    } finally {
                      setConfirm(null);
                    }
                  },
                  action === "activate"
                    ? "Rencana diaktifkan"
                    : "Rencana dibatalkan",
                );
              }}
            >
              {mutation.busy
                ? "Memproses…"
                : confirm === "activate"
                  ? "Ya, aktifkan"
                  : "Ya, batalkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
