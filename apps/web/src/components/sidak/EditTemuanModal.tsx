import { useRef } from "react";
import { Loader2, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type { ServiceType } from "@trainers/types";
import type { EditFormState } from "../../hooks/useAgentDetail";
import { SidakTemuanTimeField } from "./SidakTemuanTimeField";

interface Props {
  open: boolean;
  indicatorName: string;
  form: EditFormState;
  serviceType?: ServiceType;
  submitting: boolean;
  onFormChange: <Field extends keyof EditFormState>(field: Field, value: EditFormState[Field]) => void;
  onSave: () => void;
  onClose: () => void;
}

const NILAI_OPTIONS = [
  {
    value: 3,
    label: "Sesuai",
    desc: "Memenuhi ekspektasi",
    activeClass: "border-success bg-chart-green/5 text-success",
  },
  {
    value: 2,
    label: "Perbaikan",
    desc: "Perbaikan kecil",
    activeClass: "border-info bg-info/5 text-info",
  },
  {
    value: 1,
    label: "Tidak Sesuai",
    desc: "Perbaikan besar",
    activeClass: "border-warning bg-surface text-warning dark:bg-warning/10",
  },
  {
    value: 0,
    label: "Kritis",
    desc: "Kegagalan kritis",
    activeClass: "border-destructive-text bg-destructive/5 text-destructive-text",
  },
];

export default function EditTemuanModal({
  open,
  indicatorName,
  form,
  serviceType,
  submitting,
  onFormChange,
  onSave,
  onClose,
}: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        initialFocus={closeButtonRef}
        showCloseButton={false}
        className="max-h-[calc(100vh-2rem)] gap-0 overflow-y-auto bg-surface p-0 sm:max-w-2xl"
      >
        <DialogHeader className="relative border-b border-border p-5 pr-16">
          <p className="text-xs font-semibold text-muted-foreground">Edit temuan</p>
          <DialogTitle
            className="mt-0.5 break-words font-display text-lg font-bold leading-snug"
          >
            {indicatorName}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Ubah nilai dan catatan temuan audit.
          </DialogDescription>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={onClose}
            aria-label="Tutup edit temuan"
            className="absolute right-4 top-4 min-h-11 min-w-11 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </DialogHeader>

        <div className="flex flex-col gap-5 p-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-foreground">Nilai</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {NILAI_OPTIONS.map((option) => {
                const isActive = form.nilai === option.value;
                return (
                  <Button
                    type="button"
                    key={option.value}
                    variant={isActive ? "secondary" : "outline"}
                    size="lg"
                    onClick={() => onFormChange("nilai", option.value)}
                    aria-pressed={isActive}
                    className={`h-auto min-h-14 flex-col gap-0.5 rounded-lg p-2 ${
                      isActive
                        ? `${option.activeClass} hover:bg-surface`
                        : "text-muted-foreground"
                    }`}
                  >
                    <span className="text-lg font-bold tabular-nums">{option.value}</span>
                    <span className="text-xs font-semibold">{option.label}</span>
                    <span className="sr-only">{option.desc}</span>
                  </Button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-temuan-ketidaksesuaian">Ketidaksesuaian</Label>
            <Textarea
              id="edit-temuan-ketidaksesuaian"
              value={form.ketidaksesuaian}
              onChange={(event) => onFormChange("ketidaksesuaian", event.target.value)}
              rows={4}
              placeholder="Contoh: Agen tidak memverifikasi tanggal lahir nasabah"
              className="min-h-24 resize-y bg-background text-sm leading-relaxed text-foreground"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-temuan-sebaiknya">Rekomendasi</Label>
            <Textarea
              id="edit-temuan-sebaiknya"
              value={form.sebaiknya}
              onChange={(event) => onFormChange("sebaiknya", event.target.value)}
              rows={4}
              placeholder="Contoh: Verifikasi tiga data identitas sebelum memberi informasi"
              className="min-h-24 resize-y bg-background text-sm leading-relaxed text-foreground"
            />
          </div>

          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-semibold text-foreground">
              Tanggal temuan
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["tanggal_layanan", "Tanggal layanan"],
                ["tanggal_sampel", "Tanggal sampel"],
              ] as const).map(([field, label]) => {
                const id = `edit-temuan-${field}`;
                const empty = !form[field];
                return (
                  <div key={field} className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor={id}>{label}</Label>
                    <Input
                      id={id}
                      type="date"
                      value={form[field] ?? ""}
                      aria-describedby={empty ? `${id}-empty` : undefined}
                      onChange={(event) => onFormChange(field, event.target.value)}
                    />
                    {empty ? (
                      <p id={`${id}-empty`} className="text-xs text-muted-foreground">
                        Belum diisi
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </fieldset>
          {serviceType && (
            <SidakTemuanTimeField
              service={serviceType}
              value={form.serviceTime}
              onChange={(value) => onFormChange("serviceTime", value)}
            />
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none border-t border-border bg-muted/10 p-5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            disabled={submitting}
            className="min-h-11"
          >
            Batal
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={onSave}
            disabled={submitting}
            className="min-h-11"
          >
            {submitting ? (
              <Loader2
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : null}
            Simpan Perubahan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
