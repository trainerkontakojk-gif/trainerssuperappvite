import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** Label tombol batal. Bawaan "Batal". */
  cancelLabel?: string;
  /** `default` untuk konfirmasi yang tidak menghapus data. Bawaan `destructive`. */
  confirmVariant?: "destructive" | "default";
  /** Label tombol konfirmasi saat `busy`. Bawaan "Menghapus…". */
  busyLabel?: string;
  busy?: boolean;
  /**
   * Tempat dialog dirender. Wajib diisi di dalam lapisan `fixed z-[100]`
   * (ruang kerja PDKT) supaya dialog tidak tertutup lapisan itu.
   */
  container?: HTMLElement | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Konfirmasi aksi (SIDAK: parameter, draft, periode; PDKT: riwayat, email, pengaturan). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  confirmVariant = "destructive",
  busyLabel = "Menghapus…",
  busy = false,
  container,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        container={container}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-[44px] px-4"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            className="h-[44px] px-4"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
