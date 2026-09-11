import { useEffect, useRef } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EditForm {
  nilai: number;
  ketidaksesuaian: string;
  sebaiknya: string;
}

interface Props {
  open: boolean;
  indicatorName: string;
  form: EditForm;
  submitting: boolean;
  onFormChange: (field: keyof EditForm, value: any) => void;
  onSave: () => void;
  onClose: () => void;
}

const NILAI_OPTIONS = [
  { value: 3, label: "Sesuai", desc: "Memenuhi ekspektasi", color: "emerald" },
  { value: 2, label: "Perbaikan", desc: "Perbaikan kecil", color: "blue" },
  { value: 1, label: "Tidak Sesuai", desc: "Perbaikan besar", color: "amber" },
  { value: 0, label: "Kritis", desc: "Kegagalan kritis", color: "rose" },
];

const ACTIVE_VALUE_CLASSES: Record<string, string> = {
  emerald: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  blue: "border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  amber: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  rose: "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export default function EditTemuanModal({
  open,
  indicatorName,
  form,
  submitting,
  onFormChange,
  onSave,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        ref={dialogRef}
        showCloseButton={false}
        aria-labelledby="edit-temuan-title"
        className="max-h-[calc(100vh-2rem)] max-w-2xl gap-0 overflow-y-auto bg-surface p-0"
      >
        <DialogHeader className="relative border-b border-border p-5 pr-16">
          <p className="text-xs font-semibold text-muted-foreground">Edit temuan</p>
          <DialogTitle
            id="edit-temuan-title"
            className="mt-0.5 break-words font-outfit text-lg font-bold leading-snug"
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
                        ? ACTIVE_VALUE_CLASSES[option.color]
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
              placeholder="Deskripsi ketidaksesuaian..."
              className="min-h-24 resize-y bg-background text-sm leading-relaxed text-foreground"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-temuan-sebaiknya">Sebaiknya</Label>
            <Textarea
              id="edit-temuan-sebaiknya"
              value={form.sebaiknya}
              onChange={(event) => onFormChange("sebaiknya", event.target.value)}
              rows={4}
              placeholder="Saran perbaikan..."
              className="min-h-24 resize-y bg-background text-sm leading-relaxed text-foreground"
            />
          </div>
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
