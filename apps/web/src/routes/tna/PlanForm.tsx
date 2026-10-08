import { useState } from "react";
import {
  createTnaPlanSchema,
  type CreateTnaPlan,
  type TnaProgram,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import type { SimulationSubjectOption } from "../../lib/api/rpc-client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, State } from "./shared";
import { selectClass, interventionLabels } from "./utils";

export type ParticipantOption = { id: string; name: string };
export function PlanForm({
  initial,
  programs,
  participants,
  busy,
  disabled,
  editing = false,
  onSave,
}: {
  initial: CreateTnaPlan;
  programs: TnaProgram[];
  participants: ParticipantOption[];
  busy: boolean;
  disabled: boolean;
  editing?: boolean;
  onSave: (values: CreateTnaPlan) => void;
}) {
  const [selected, setSelected] = useState(initial.participant_peserta_ids);
  const [options, setOptions] = useState(participants);
  const [search, setSearch] = useState("");
  const [invalid, setInvalid] = useState(false);
  const results = useApi<SimulationSubjectOption[]>(
    search.trim().length >= 2
      ? `/profiler/peserta/options?search=${encodeURIComponent(search.trim())}`
      : null,
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const parsed = createTnaPlanSchema.safeParse({
          need_id: initial.need_id,
          program_id: editing ? initial.program_id : f.get("program"),
          title: f.get("title"),
          intervention_type: f.get("intervention"),
          start_date: f.get("start"),
          end_date: f.get("end"),
          evaluation_due_date: f.get("evaluation"),
          target_max_rate_per_100: Number(f.get("rate")),
          target_max_spread_pct: Number(f.get("spread")),
          participant_peserta_ids: selected,
        });
        setInvalid(!parsed.success);
        if (parsed.success) onSave(parsed.data);
      }}
    >
      <fieldset disabled={busy || disabled} className="space-y-4">
        {!editing && (
          <Field label="Program">
            <select
              required
              name="program"
              defaultValue={initial.program_id}
              className={selectClass}
            >
              <option value="" disabled>
                Pilih program
              </option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Judul rencana">
          <Input
            className="h-[44px]"
            name="title"
            required
            minLength={5}
            maxLength={160}
            defaultValue={initial.title}
          />
        </Field>
        <Field label="Jenis intervensi">
          <select
            name="intervention"
            className={selectClass}
            defaultValue={initial.intervention_type}
          >
            {Object.entries(interventionLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tanggal mulai">
            <Input
              className="h-[44px] min-w-0"
              name="start"
              type="date"
              required
              defaultValue={initial.start_date}
            />
          </Field>
          <Field label="Tanggal selesai">
            <Input
              className="h-[44px] min-w-0"
              name="end"
              type="date"
              required
              defaultValue={initial.end_date}
            />
          </Field>
          <Field label="Tanggal evaluasi">
            <Input
              className="h-[44px] min-w-0"
              name="evaluation"
              type="date"
              required
              defaultValue={initial.evaluation_due_date}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target tingkat maksimal (per 100 sesi sampel)">
            <Input
              className="h-[44px]"
              name="rate"
              type="number"
              required
              min={0}
              max={100}
              step="any"
              defaultValue={initial.target_max_rate_per_100}
            />
          </Field>
          <Field label="Target sebaran maksimal (%)">
            <Input
              className="h-[44px]"
              name="spread"
              type="number"
              required
              min={0}
              max={100}
              step="any"
              defaultValue={initial.target_max_spread_pct}
            />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">
            Peserta ({selected.length}/200)
          </legend>
          <p className="text-sm text-muted-foreground">
            Peserta pra-terisi dari agent terdampak. Pilih 1–200 peserta; daftar
            dikunci saat aktivasi.
          </p>
          {options.map((p) => (
            <label
              className="flex min-h-[44px] items-center gap-3 text-sm"
              key={p.id}
            >
              <input
                type="checkbox"
                className="size-5 accent-foreground"
                checked={selected.includes(p.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, p.id]
                      : selected.filter((id) => id !== p.id),
                  )
                }
              />
              {p.name}
            </label>
          ))}
          {!options.length && (
            <p className="text-sm text-muted-foreground">
              Belum ada peserta. Cari dan tambahkan peserta.
            </p>
          )}
        </fieldset>
        <Field label="Cari peserta">
          <Input
            className="h-[44px]"
            maxLength={100}
            value={search}
            placeholder="Minimal 2 karakter nama peserta"
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <State
          loading={results.loading}
          error={results.error}
          retry={results.refetch}
        />
        {search.trim().length >= 2 &&
          !results.loading &&
          results.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Peserta tidak ditemukan.
            </p>
          )}
        {results.data
          ?.filter((p) => !options.some((o) => o.id === p.id))
          .map((p) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2"
              key={p.id}
            >
              <p className="text-sm">
                {p.nama} · {p.tim}
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                disabled={selected.length >= 200}
                onClick={() => {
                  setOptions([...options, { id: p.id, name: p.nama }]);
                  setSelected([...selected, p.id]);
                }}
              >
                Tambah {p.nama}
              </Button>
            </div>
          ))}
      </fieldset>
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          Periksa judul (minimal 5 karakter), program, target 0–100, dan 1–200
          peserta unik. Tanggal selesai tidak boleh sebelum mulai; evaluasi
          harus setelah selesai.
        </p>
      )}
      <Button
        className="min-h-[44px]"
        type="submit"
        disabled={busy || disabled}
      >
        {busy ? "Menyimpan…" : editing ? "Simpan perubahan" : "Buat rencana"}
      </Button>
    </form>
  );
}
