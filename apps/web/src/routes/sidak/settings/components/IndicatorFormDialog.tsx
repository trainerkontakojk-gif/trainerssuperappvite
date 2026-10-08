import { useState, type FormEvent } from "react";
import type { ScoringMode, ServiceType } from "@trainers/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAT_LABEL } from "../constants";
import type { IndicatorFormState } from "../types";
import { parseIndicatorCategory } from "../utils";

interface IndicatorFormDialogProps {
  open: boolean;
  mode: "add" | "edit";
  initialForm: IndicatorFormState;
  scoringMode: ScoringMode;
  serviceType: ServiceType;
  saving: boolean;
  onClose: () => void;
  onSubmit: (form: IndicatorFormState) => Promise<void>;
}

const fieldClass = "!h-[44px]";

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function IndicatorForm({
  mode,
  initialForm,
  scoringMode,
  serviceType,
  saving,
  onClose,
  onSubmit,
}: Omit<IndicatorFormDialogProps, "open">) {
  const [form, setForm] = useState<IndicatorFormState>(initialForm);
  const isSlik = serviceType === "slik";
  const hasGroup = isSlik && form.parameter_group.trim().length > 0;

  const categoryItems = [
    { value: "non_critical", label: CAT_LABEL.non_critical },
    { value: "critical", label: CAT_LABEL.critical },
    ...(scoringMode === "no_category"
      ? [{ value: "none", label: CAT_LABEL.none }]
      : []),
  ];

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!saving && form.name.trim()) void onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="px-4 pt-4 pr-12">
        <DialogTitle>
          {mode === "add" ? "Tambah parameter" : "Edit parameter"}
        </DialogTitle>
        <DialogDescription>
          Perubahan hanya berlaku pada draft ini sampai dipublish.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {isSlik && (
          <Field
            label="Parameter utama"
            htmlFor="indicator-parameter-group"
            hint="Isi untuk mengelompokkan beberapa item penilaian di bawah satu parameter."
          >
            <Input
              id="indicator-parameter-group"
              className={fieldClass}
              value={form.parameter_group}
              onChange={(e) => setForm({ ...form, parameter_group: e.target.value })}
              placeholder="Kosongkan jika tanpa sub-parameter"
            />
          </Field>
        )}
        <Field
          label={hasGroup ? "Sub-parameter" : "Nama parameter"}
          htmlFor="indicator-name"
        >
          <Input
            id="indicator-name"
            className={fieldClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Contoh: Salam pembuka"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kategori" htmlFor="indicator-category">
            <Select
              items={categoryItems}
              value={form.category}
              disabled={scoringMode === "no_category"}
              onValueChange={(value) => {
                if (value !== null)
                  setForm({ ...form, category: parseIndicatorCategory(value) });
              }}
            >
              <SelectTrigger
                id="indicator-category"
                aria-label="Kategori"
                className="!h-[44px] w-full min-w-0 bg-background px-3 text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {categoryItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Bobot (%)" htmlFor="indicator-bobot">
            <Input
              id="indicator-bobot"
              type="number"
              inputMode="decimal"
              className={fieldClass}
              value={form.bobot}
              onChange={(e) => setForm({ ...form, bobot: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ambang" htmlFor="indicator-threshold">
            <Input
              id="indicator-threshold"
              type="number"
              inputMode="decimal"
              className={fieldClass}
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: e.target.value })}
              placeholder="Opsional"
            />
          </Field>
          <Field label="Urutan" htmlFor="indicator-sort-order">
            <Input
              id="indicator-sort-order"
              type="number"
              inputMode="numeric"
              className={fieldClass}
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            />
          </Field>
        </div>
        <Label
          htmlFor="indicator-has-na"
          className="min-h-[44px] cursor-pointer gap-3 text-sm"
        >
          <input
            id="indicator-has-na"
            type="checkbox"
            checked={form.has_na}
            onChange={(e) => setForm({ ...form, has_na: e.target.checked })}
            className="size-5 accent-primary"
          />
          N/A diizinkan
        </Label>
      </div>

      <DialogFooter className="mx-0 mb-0">
        <Button
          type="button"
          variant="outline"
          className="h-[44px] px-4"
          disabled={saving}
          onClick={onClose}
        >
          Batal
        </Button>
        <Button
          type="submit"
          className="h-[44px] px-4"
          disabled={saving || !form.name.trim()}
        >
          {saving
            ? "Menyimpan…"
            : mode === "add"
              ? "Tambah parameter"
              : "Simpan perubahan"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Dialog tambah/edit parameter di atas `ui/dialog`; field & payload tidak berubah. */
export function IndicatorFormDialog({ open, ...rest }: IndicatorFormDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !rest.saving) rest.onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-lg"
      >
        <IndicatorForm {...rest} />
      </DialogContent>
    </Dialog>
  );
}
