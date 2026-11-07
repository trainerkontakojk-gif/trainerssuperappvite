import { useId, useState } from "react";
import {
  createTnaProgramSchema,
  rootCauseClusterIds,
  updateTnaProgramSchema,
  VALID_SERVICE_TYPES,
  type CreateTnaProgram,
  type TnaCatalogProgram,
  type TnaGapType,
} from "@trainers/types";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { SERVICE_LABELS } from "../../lib/scoring";
import { Field } from "./shared";
import {
  clusterLabels,
  gapTypeLabels,
  practiceModuleLabels,
  practiceModules,
  selectClass,
} from "./utils";

export type ProgramValues = Omit<CreateTnaProgram, "code"> & { code?: string };

const issueMessages: Record<string, string> = {
  code: "Kode: huruf kecil, angka, atau tanda hubung, 3–48 karakter, diawali huruf.",
  name: "Nama: 3–120 karakter.",
  description: "Deskripsi: 10–1000 karakter.",
};

// Selections always follow the registry order, so the same choice always
// sends the same array, whether or not the trainer touched the group.
const inOrder = <T extends string>(
  options: readonly T[],
  selected: readonly T[] = [],
) => options.filter((option) => selected.includes(option));

// Checkbox group over a registry, kept in registry order.
function Choices<T extends string>({
  legend,
  hint,
  options,
  labels,
  selected,
  onChange,
}: {
  legend: string;
  hint?: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{legend}</legend>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      <div className="grid gap-x-6 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option}
            className="flex min-h-[44px] items-center gap-3 text-sm"
          >
            <input
              type="checkbox"
              className="size-5 accent-foreground"
              checked={selected.includes(option)}
              onChange={(e) =>
                onChange(
                  options.filter((o) =>
                    o === option ? e.target.checked : selected.includes(o),
                  ),
                )
              }
            />
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Create (no `program`) or edit a catalog program (plans/markdown/tna-phase-5.md
 * D26, K33): code is set once and never edited; ids follow the code registries.
 */
export function ProgramForm({
  program,
  busy,
  onSave,
  onCancel,
}: {
  program: TnaCatalogProgram | null;
  busy: boolean;
  onSave: (values: ProgramValues) => void;
  onCancel: () => void;
}) {
  const codeHint = useId();
  const [code, setCode] = useState("");
  const [name, setName] = useState(program?.name ?? "");
  const [description, setDescription] = useState(program?.description ?? "");
  const [gapType, setGapType] = useState<TnaGapType>(
    program?.gap_type ?? "skill",
  );
  const [clusters, setClusters] = useState(() =>
    inOrder(rootCauseClusterIds, program?.trigger_clusters),
  );
  const [services, setServices] = useState(() =>
    inOrder(VALID_SERVICE_TYPES, program?.service_types),
  );
  const [modules, setModules] = useState(() =>
    inOrder(practiceModules, program?.suggested_modules),
  );
  const [issues, setIssues] = useState<string[]>([]);

  return (
    <form
      aria-label={program ? `Ubah ${program.name}` : "Program baru"}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fields = {
          name,
          description,
          gap_type: gapType,
          trigger_clusters: clusters,
          service_types: services,
          suggested_modules: modules,
        };
        const parsed = program
          ? updateTnaProgramSchema.safeParse({
              ...fields,
              expected_updated_at: program.updated_at,
            })
          : createTnaProgramSchema.safeParse({ code, ...fields });
        if (!parsed.success) {
          setIssues([
            ...new Set(
              parsed.error.issues.map(
                (issue) =>
                  issueMessages[String(issue.path[0])] ??
                  "Periksa kembali data program.",
              ),
            ),
          ]);
          return;
        }
        setIssues([]);
        const { expected_updated_at: _revision, ...values } =
          parsed.data as ProgramValues & { expected_updated_at?: string };
        onSave(values as ProgramValues);
      }}
    >
      <fieldset disabled={busy} className="space-y-4">
        {!program && (
          <div className="space-y-2">
            <Field label="Kode">
              <Input
                className="h-[44px] max-w-sm"
                value={code}
                maxLength={48}
                autoComplete="off"
                aria-describedby={codeHint}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <p id={codeHint} className="text-sm text-muted-foreground">
              Huruf kecil, angka, dan tanda hubung. Tidak bisa diubah setelah
              disimpan.
            </p>
          </div>
        )}
        <Field label="Nama">
          <Input
            className="h-[44px]"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Deskripsi">
          <Textarea
            value={description}
            maxLength={1000}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Jenis gap">
          <select
            className={`${selectClass} max-w-sm`}
            value={gapType}
            onChange={(e) => setGapType(e.target.value as TnaGapType)}
          >
            {Object.entries(gapTypeLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Choices
          legend="Klaster pemicu"
          hint="Program disarankan untuk kebutuhan dengan penyebab ini."
          options={rootCauseClusterIds}
          labels={clusterLabels}
          selected={clusters}
          onChange={setClusters}
        />
        <Choices
          legend="Layanan"
          hint="Kosongkan untuk semua layanan."
          options={VALID_SERVICE_TYPES}
          labels={SERVICE_LABELS}
          selected={services}
          onChange={setServices}
        />
        <Choices
          legend="Latihan simulasi"
          hint="Menjadi target latihan bawaan saat rencana dibuat."
          options={practiceModules}
          labels={practiceModuleLabels}
          selected={modules}
          onChange={setModules}
        />
      </fieldset>
      {issues.length > 0 && (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          {issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-[44px]" type="submit" disabled={busy}>
          {busy ? "Menyimpan…" : "Simpan program"}
        </Button>
        <Button
          className="min-h-[44px]"
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
