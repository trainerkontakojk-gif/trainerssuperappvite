import { useEffect, useId, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "../../../../components/ui/button";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "default" | "destructive";
  pending?: boolean;
  /** Bila diisi, dialog meminta alasan wajib dan meneruskannya ke `onConfirm`. */
  reasonLabel?: string;
  onConfirm: (reason: string) => void | Promise<void>;
}

/**
 * Konfirmasi in-app pengganti `window.confirm()`: punya role `alertdialog`,
 * fokus terkunci, dan bisa mewajibkan alasan untuk aksi yang tercatat di audit.
 * Alasan dibuang saat dialog ditutup (bukan saat aksi gagal), supaya tidak bocor
 * ke aksi berikutnya tetapi juga tidak hilang ketika pengguna perlu mencoba lagi.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "default",
  pending = false,
  reasonLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const reasonMissing = Boolean(reasonLabel) && !reason.trim();

  // Juga menangkap penutupan dari parent (mis. setelah aksi sukses).
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-popover p-5 text-sm text-popover-foreground shadow-lg outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="grid gap-1.5">
            <AlertDialog.Title className="font-display text-lg font-semibold tracking-tight text-foreground">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-pretty text-muted-foreground">
              {description}
            </AlertDialog.Description>
          </div>

          {reasonLabel ? (
            <div className="grid gap-2">
              <Label htmlFor={reasonId}>{reasonLabel}</Label>
              <Textarea
                id={reasonId}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="Tulis alasan singkat yang akan tercatat di log."
              />
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close
              render={
                <Button
                  variant="outline"
                  className="h-11 sm:h-9"
                  disabled={pending}
                />
              }
            >
              Batal
            </AlertDialog.Close>
            <Button
              variant={tone === "destructive" ? "destructive" : "default"}
              className="h-11 sm:h-9"
              disabled={pending || reasonMissing}
              onClick={() => onConfirm(reason.trim())}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
