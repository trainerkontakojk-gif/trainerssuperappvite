import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import {
  VALID_SERVICE_TYPES,
  efekSessionInputSchema,
  EFEK_MAX_PARTICIPANTS,
  type EfekPlanOption,
  type EfekProgram,
  type EfekSessionDetail,
  type ServiceType,
  type TnaPlanDetail,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import type { EfekSessionSearch } from "../../router";
import {
  rpcClient,
  type SimulationSubjectOption,
} from "../../lib/api/rpc-client";
import { ApiError, unwrapResponse } from "../../lib/api/unwrap-response";
import QaStatePanel from "../../components/ui/QaStatePanel";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { SERVICE_LABELS } from "../../lib/scoring";
import { Surface, Field, State, MutationState } from "./shared";
import { TnaTabs } from "./TnaTabs";
import { planStatusLabels, selectClass, useTnaMutation } from "./utils";

type Person = { id: string; nama: string; tim: string | null };

/** `/tna/efek/sesi/baru` (create) and `/tna/efek/sesi/$id` (edit or delete). */
export default function EfekSessionPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id;
  const search = useSearch({ strict: false }) as EfekSessionSearch;
  const programs = useApi<EfekProgram[]>("/tna/efek/programs");
  const existing = useApi<EfekSessionDetail>(
    id ? `/tna/efek/sessions/${id}` : null,
  );
  const planId = !id && search.plan ? search.plan : null;
  const plan = useApi<TnaPlanDetail>(planId ? `/tna/plans/${planId}` : null);
  const ready = programs.data && (!id || existing.data) && (!planId || plan.data);
  return (
    <Surface
      title={id ? "Ubah sesi pelatihan" : "Sesi pelatihan baru"}
      description="Peserta diambil dari Profiler. Layanan menentukan nilai QA SIDAK yang dipakai untuk mengukur efek pelatihan."
    >
      <TnaTabs current="efek" />
      <Link
        to="/tna/efek"
        className="inline-flex min-h-[44px] items-center text-sm underline underline-offset-4"
      >
        Kembali ke EFEK
      </Link>
      <State
        loading={programs.loading || existing.loading || plan.loading}
        error={programs.error || existing.error || plan.error}
        retry={() => {
          programs.refetch();
          existing.refetch();
          plan.refetch();
        }}
      />
      {ready && (
        <SessionForm
          key={existing.data?.updated_at ?? `new/${planId ?? ""}`}
          programs={programs.data!}
          existing={existing.data}
          initialPlan={plan.data}
          initialProgram={search.program}
        />
      )}
    </Surface>
  );
}

function SessionForm({
  programs,
  existing,
  initialPlan,
  initialProgram,
}: {
  programs: EfekProgram[];
  existing: EfekSessionDetail | null;
  initialPlan: TnaPlanDetail | null;
  initialProgram?: string;
}) {
  const navigate = useNavigate();
  const mutation = useTnaMutation();
  const firstProgram =
    existing?.program_code ??
    programs.find((p) => p.code === initialProgram)?.code ??
    programs[0]?.code ??
    "";
  const defaultService = (code: string) =>
    programs.find((p) => p.code === code)?.default_service_type ?? "call";
  const [program, setProgram] = useState(firstProgram);
  const [service, setService] = useState<ServiceType>(
    existing?.service_type ??
      initialPlan?.service_type ??
      defaultService(firstProgram),
  );
  const [tnaPlanId, setTnaPlanId] = useState(
    existing?.tna_plan?.id ?? initialPlan?.plan.id ?? "",
  );
  const [planError, setPlanError] = useState<string | null>(null);
  // Keep the prefilled plan visible until the option list arrives.
  const selectedPlan =
    existing?.tna_plan ??
    (initialPlan
      ? {
          id: initialPlan.plan.id,
          title: initialPlan.plan.title,
          status: initialPlan.plan.status,
        }
      : null);
  const [title, setTitle] = useState(
    existing?.title ?? initialPlan?.plan.title ?? "",
  );
  const [start, setStart] = useState(
    existing?.start_date ?? initialPlan?.plan.start_date ?? "",
  );
  const [end, setEnd] = useState(
    existing?.end_date ?? initialPlan?.plan.end_date ?? "",
  );
  const [people, setPeople] = useState<Person[]>(
    existing?.participants.map((p) => ({
      id: p.peserta_id,
      nama: p.nama,
      tim: p.tim,
    })) ??
      initialPlan?.participants.flatMap((p) =>
        p.peserta_id
          ? [
              {
                id: p.peserta_id,
                nama: p.peserta_name_snapshot,
                tim: p.team_snapshot,
              },
            ]
          : [],
      ) ??
      [],
  );
  const [query, setQuery] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const planOptions = useApi<EfekPlanOption[]>(
    service && start
      ? `/tna/efek/plan-options?service_type=${encodeURIComponent(service)}&start_date=${encodeURIComponent(start)}`
      : null,
  );
  const results = useApi<SimulationSubjectOption[]>(
    query.trim().length >= 2
      ? `/profiler/peserta/options?search=${encodeURIComponent(query.trim())}`
      : null,
  );
  useEffect(() => {
    if (!end && start) setEnd(start);
  }, [start, end]);

  const save = () => {
    const parsed = efekSessionInputSchema.safeParse({
      program_code: program,
      title,
      service_type: service,
      start_date: start,
      end_date: end || start,
      peserta_ids: people.map((p) => p.id),
      // Omitted when unlinked so the create payload stays unchanged; an
      // explicit null detaches a previously linked session.
      tna_plan_id: tnaPlanId
        ? tnaPlanId
        : existing?.tna_plan
          ? null
          : undefined,
    });
    setInvalid(!parsed.success);
    if (!parsed.success) return;
    mutation.run(
      async () => {
        setPlanError(null);
        try {
          if (existing)
            await unwrapResponse(
              await rpcClient.v1.tna.efek.sessions[":id"].$put(
                { param: { id: existing.id } },
                { init: { body: JSON.stringify(parsed.data) } },
              ),
            );
          else
            await unwrapResponse(
              await rpcClient.v1.tna.efek.sessions.$post({ json: parsed.data }),
            );
        } catch (error) {
          if (error instanceof ApiError && error.code === "EFEK_PLAN_INVALID")
            setPlanError(error.message);
          throw error;
        }
        if (!existing && initialPlan)
          await navigate({
            to: "/tna/rencana/$id",
            params: { id: initialPlan.plan.id },
          });
        else await navigate({ to: "/tna/efek", search: { program } });
      },
      existing ? "Sesi tersimpan" : "Sesi dibuat",
    );
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <fieldset disabled={mutation.busy} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Program">
            <select
              className={selectClass}
              value={program}
              onChange={(e) => {
                setProgram(e.target.value);
                setService(defaultService(e.target.value));
              }}
            >
              {programs.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Layanan yang diukur">
            <select
              className={selectClass}
              value={service}
              onChange={(e) => setService(e.target.value as ServiceType)}
            >
              {VALID_SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {SERVICE_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rencana TNA (opsional)">
            <select
              className={selectClass}
              value={tnaPlanId}
              onChange={(e) => {
                setTnaPlanId(e.target.value);
                setPlanError(null);
              }}
            >
              <option value="">Tanpa rencana</option>
              {selectedPlan?.id === tnaPlanId &&
                !planOptions.data?.some((o) => o.id === tnaPlanId) && (
                  <option value={tnaPlanId}>
                    {selectedPlan.title} · {planStatusLabels[selectedPlan.status]}
                  </option>
                )}
              {planOptions.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title} · {planStatusLabels[o.status]}
                </option>
              ))}
            </select>
            <p className="text-sm font-normal text-muted-foreground">
              Hanya rencana aktif, evaluasi, atau selesai dengan layanan dan
              tanggal sesi yang cocok.
            </p>
            {planError && (
              <p role="alert" className="text-sm text-destructive">
                {planError}
              </p>
            )}
          </Field>
          <Field label="Nama sesi">
            <Input
              className="h-[44px]"
              value={title}
              maxLength={160}
              placeholder="Contoh: Level Up Week Mei"
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal mulai">
              <Input
                className="h-[44px] min-w-0"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Tanggal selesai">
              <Input
                className="h-[44px] min-w-0"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">
            Peserta ({people.length}/{EFEK_MAX_PARTICIPANTS})
          </legend>
          {people.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Belum ada peserta. Cari nama di Profiler lalu tambahkan.
            </p>
          )}
          <ul className="divide-y divide-border rounded-lg border border-border empty:hidden">
            {people.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-1"
              >
                <span className="text-sm">
                  {p.nama}
                  {p.tim && (
                    <span className="text-muted-foreground"> · {p.tim}</span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={() =>
                    setPeople(people.filter((other) => other.id !== p.id))
                  }
                >
                  Hapus {p.nama}
                </Button>
              </li>
            ))}
          </ul>
        </fieldset>
        <Field label="Cari peserta">
          <Input
            className="h-[44px]"
            maxLength={100}
            value={query}
            placeholder="Minimal 2 karakter nama peserta"
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <State
          loading={results.loading}
          error={results.error}
          retry={results.refetch}
        />
        {query.trim().length >= 2 &&
          !results.loading &&
          results.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Peserta tidak ditemukan.
            </p>
          )}
        {results.data
          ?.filter((r) => !people.some((p) => p.id === r.id))
          .map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2"
            >
              <p className="text-sm">
                {r.nama} · {r.tim}
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                disabled={people.length >= EFEK_MAX_PARTICIPANTS}
                onClick={() =>
                  setPeople([...people, { id: r.id, nama: r.nama, tim: r.tim }])
                }
              >
                Tambah {r.nama}
              </Button>
            </div>
          ))}
      </fieldset>

      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          Lengkapi nama sesi (minimal 3 karakter), tanggal mulai, dan minimal 1
          peserta. Tanggal selesai tidak boleh sebelum mulai, paling lama 92
          hari.
        </p>
      )}
      <MutationState mutation={mutation} reload={() => location.reload()} />
      <div className="flex flex-wrap items-center gap-3">
        <Button className="min-h-[44px]" type="submit" disabled={mutation.busy}>
          {mutation.busy
            ? "Menyimpan…"
            : existing
              ? "Simpan perubahan"
              : "Simpan sesi"}
        </Button>
        {existing && !confirmDelete && (
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            onClick={() => setConfirmDelete(true)}
          >
            Hapus sesi
          </Button>
        )}
      </div>
      {existing && confirmDelete && (
        <QaStatePanel
          type="warning"
          className="text-foreground!"
          title={`Hapus sesi "${existing.title}"?`}
          description="Daftar peserta sesi ini ikut terhapus. Nilai SIDAK peserta tidak berubah."
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                className="min-h-[44px]"
                disabled={mutation.busy}
                onClick={() =>
                  mutation.run(async () => {
                    await unwrapResponse(
                      await rpcClient.v1.tna.efek.sessions[":id"].$delete({
                        param: { id: existing.id },
                      }),
                    );
                    await navigate({ to: "/tna/efek" });
                  }, "Sesi dihapus")
                }
              >
                Ya, hapus
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setConfirmDelete(false)}
              >
                Batal
              </Button>
            </div>
          }
        />
      )}
    </form>
  );
}
