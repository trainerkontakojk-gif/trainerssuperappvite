import { useState } from "react";
import type {
  TnaCatalogProgram,
  TnaProgramCoverage,
  UpdateTnaProgram,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import { rpcClient } from "../../lib/api/rpc-client";
import { unwrapResponse } from "../../lib/api/unwrap-response";
import { SERVICE_LABELS } from "../../lib/scoring";
import { Button } from "../../components/ui/button";
import { MutationState, State, Surface } from "./shared";
import { ProgramForm, type ProgramValues } from "./ProgramForm";
import { TnaTabs } from "./TnaTabs";
import {
  clusterLabels,
  gapTypeLabels,
  practiceModuleLabels,
  tnaResponse,
  useTnaMutation,
} from "./utils";

const STALE = "Program sudah berubah, muat ulang";
const listOr = (items: string[], empty: string) =>
  items.length ? items.join(", ") : empty;

// TNA phase 5 catalog (plans/markdown/tna-phase-5.md D26, K33, K36, P-2).
// Programs are never deleted: deactivating hides them from suggestions and
// new plans while plans that already use them keep running.
export default function TnaCatalog() {
  const programs = useApi<TnaCatalogProgram[]>(
    "/tna/programs?include_inactive=1",
  );
  const coverage = useApi<TnaProgramCoverage>("/tna/programs/coverage");
  const mutation = useTnaMutation();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const reload = () => Promise.all([programs.refetch(), coverage.refetch()]);
  const sorted = [...(programs.data ?? [])].sort(
    (a, b) =>
      Number(b.is_active) - Number(a.is_active) ||
      a.name.localeCompare(b.name, "id"),
  );

  const save = (program: TnaCatalogProgram | null, values: ProgramValues) =>
    mutation.run(
      async () => {
        if (program) {
          const { code: _code, ...fields } = values;
          await tnaResponse(
            rpcClient.v1.tna.programs[":id"].$patch(
              { param: { id: program.id } },
              {
                init: {
                  body: JSON.stringify({
                    ...fields,
                    expected_updated_at: program.updated_at,
                  } satisfies UpdateTnaProgram),
                },
              },
            ),
            STALE,
          );
        } else {
          // Create has no revision: a 409 here is a duplicate code to fix in
          // the form, not a stale page.
          await unwrapResponse(
            await rpcClient.v1.tna.programs.$post({
              json: values as Required<ProgramValues>,
            }),
          );
        }
        setEditing(null);
        await reload();
      },
      program ? "Program disimpan" : "Program ditambahkan",
    );

  const setActive = (program: TnaCatalogProgram, active: boolean) =>
    mutation.run(
      async () => {
        await tnaResponse(
          rpcClient.v1.tna.programs[":id"].active.$post(
            { param: { id: program.id } },
            {
              init: {
                body: JSON.stringify({
                  active,
                  expected_updated_at: program.updated_at,
                }),
              },
            },
          ),
          STALE,
        );
        setConfirming(null);
        await reload();
      },
      active ? "Program diaktifkan" : "Program dinonaktifkan",
    );

  return (
    <Surface
      title="TNA"
      description="Kelola program pelatihan yang disarankan TNA. Program tidak dihapus; nonaktifkan program yang tidak dipakai lagi."
    >
      <TnaTabs current="katalog" />
      <section aria-labelledby="tna-coverage-heading" className="space-y-3">
        <h2
          id="tna-coverage-heading"
          className="font-heading text-xl font-bold"
        >
          Klaster tanpa program
        </h2>
        <State
          loading={coverage.loading}
          error={coverage.error}
          retry={coverage.refetch}
        />
        {coverage.data &&
          (coverage.data.uncovered_clusters.length ? (
            <>
              <p className="max-w-[70ch] text-sm text-muted-foreground">
                Kebutuhan dengan penyebab ini belum mendapat saran program.
                Tambahkan klaster ke program yang sesuai.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {coverage.data.uncovered_clusters.map((cluster) => (
                  <li key={cluster}>{clusterLabels[cluster]}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Setiap klaster penyebab sudah dipicu minimal satu program aktif.
            </p>
          ))}
      </section>

      <section aria-labelledby="tna-programs-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="tna-programs-heading"
            className="font-heading text-xl font-bold"
          >
            Program
          </h2>
          {editing !== "new" && (
            <Button
              className="min-h-[44px]"
              disabled={mutation.busy}
              onClick={() => {
                mutation.reset();
                setConfirming(null);
                setEditing("new");
              }}
            >
              Tambah program
            </Button>
          )}
        </div>
        <MutationState
          mutation={mutation}
          reload={async () => {
            mutation.reset();
            setEditing(null);
            setConfirming(null);
            await reload();
          }}
        />
        {editing === "new" && (
          <div className="border-y border-border py-4">
            <ProgramForm
              program={null}
              busy={mutation.busy}
              onSave={(values) => save(null, values)}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}
        <State
          loading={programs.loading && !programs.data}
          error={programs.error}
          retry={programs.refetch}
        />
        {programs.data && (
          <ul
            aria-label="Daftar program"
            className="divide-y divide-border border-y border-border"
          >
            {sorted.map((program) => (
              <li key={program.id} className="space-y-3 py-4">
                {editing === program.id ? (
                  <ProgramForm
                    program={program}
                    busy={mutation.busy}
                    onSave={(values) => save(program, values)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <ProgramRow
                    program={program}
                    busy={mutation.busy}
                    confirming={confirming === program.id}
                    onEdit={() => {
                      mutation.reset();
                      setConfirming(null);
                      setEditing(program.id);
                    }}
                    onToggle={() => {
                      mutation.reset();
                      if (program.is_active) setConfirming(program.id);
                      else setActive(program, true);
                    }}
                    onConfirm={() => setActive(program, false)}
                    onCancelConfirm={() => setConfirming(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Surface>
  );
}

function ProgramRow({
  program: p,
  busy,
  confirming,
  onEdit,
  onToggle,
  onConfirm,
  onCancelConfirm,
}: {
  program: TnaCatalogProgram;
  busy: boolean;
  confirming: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold">{p.name}</h3>
          <p className="text-sm text-muted-foreground">
            {p.code} · {gapTypeLabels[p.gap_type]} ·{" "}
            {p.is_active ? "Aktif" : "Nonaktif"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-[44px]"
            aria-label={`Ubah ${p.name}`}
            disabled={busy}
            onClick={onEdit}
          >
            Ubah
          </Button>
          <Button
            variant="outline"
            className="min-h-[44px]"
            aria-label={`${p.is_active ? "Nonaktifkan" : "Aktifkan"} ${p.name}`}
            disabled={busy || confirming}
            onClick={onToggle}
          >
            {p.is_active ? "Nonaktifkan" : "Aktifkan"}
          </Button>
        </div>
      </div>
      <p className="max-w-[70ch] text-sm">{p.description}</p>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm sm:gap-x-6">
        <dt className="text-muted-foreground">Klaster pemicu</dt>
        <dd>
          {listOr(
            p.trigger_clusters.map((c) => clusterLabels[c]),
            "Tidak ada",
          )}
        </dd>
        <dt className="text-muted-foreground">Layanan</dt>
        <dd>
          {listOr(
            p.service_types.map((s) => SERVICE_LABELS[s]),
            "Semua layanan",
          )}
        </dd>
        <dt className="text-muted-foreground">Latihan simulasi</dt>
        <dd>
          {listOr(
            p.suggested_modules.map((m) => practiceModuleLabels[m]),
            "Tanpa latihan",
          )}
        </dd>
        <dt className="text-muted-foreground">Dipakai</dt>
        <dd className="tabular-nums">{p.plan_count} rencana</dd>
      </dl>
      {confirming && (
        <div
          role="group"
          aria-label={`Konfirmasi nonaktifkan ${p.name}`}
          className="space-y-3 border-t border-border pt-3"
        >
          <p className="max-w-[70ch] text-sm">
            Dipakai {p.plan_count} rencana. Rencana itu tetap berjalan dengan
            program ini; program tidak lagi muncul di saran dan rencana baru.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-[44px]"
              disabled={busy}
              onClick={onConfirm}
            >
              Nonaktifkan
            </Button>
            <Button
              variant="outline"
              className="min-h-[44px]"
              disabled={busy}
              onClick={onCancelConfirm}
            >
              Batal
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
