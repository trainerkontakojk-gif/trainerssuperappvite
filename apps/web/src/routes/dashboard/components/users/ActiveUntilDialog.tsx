import { useState, type ReactNode } from "react";
import { activeUntilValid, formatWibDay, wibToday } from "@trainers/types";
import { Button } from "../../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";

/** The day after `day`, as YYYY-MM-DD. */
function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

interface ActiveUntilFieldProps {
  /** null = no limit; "" = a date is wanted but not picked yet. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Shown under "Tanpa batas waktu" when no date is chosen. */
  hint?: string;
}

/**
 * Masa aktif: no limit, or the last WIB day the account may be used. Always
 * says exactly when the account stops.
 */
export function ActiveUntilField({
  value,
  onChange,
  hint,
}: ActiveUntilFieldProps) {
  const radio = (dated: boolean, label: ReactNode) => (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
      <input
        type="radio"
        name="active-until"
        checked={(value !== null) === dated}
        onChange={() => onChange(dated ? (value ?? "") : null)}
        className="mt-0.5 size-4 accent-foreground"
      />
      {label}
    </label>
  );
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-sm text-muted-foreground">Masa aktif</legend>
      {radio(false, <span className="text-foreground">Tanpa batas waktu</span>)}
      {radio(
        true,
        <span className="grid gap-1.5">
          <span className="inline-flex flex-wrap items-center gap-2 text-foreground">
            Sampai tanggal
            <Input
              type="date"
              aria-label="Tanggal terakhir"
              min={wibToday()}
              value={value ?? ""}
              onFocus={() => value === null && onChange("")}
              onChange={(event) => onChange(event.target.value)}
              className="h-9 w-40"
            />
          </span>
          <span className="text-xs text-muted-foreground">
            Hari terakhir akun bisa dipakai, sampai 23.59 WIB.
          </span>
        </span>,
      )}
      {value ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Mulai {formatWibDay(nextDay(value))} pukul 00.00 WIB akun ini tidak
          bisa masuk dan semua login-nya diakhiri. Data dan riwayatnya tetap
          ada. Perpanjang kapan saja.
        </p>
      ) : value === null && hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </fieldset>
  );
}

interface ActiveUntilDialogProps {
  title: string;
  current: string | null;
  saveLabel?: string;
  onClose: () => void;
  onSave: (day: string | null) => Promise<boolean>;
}

/** Atur masa aktif for one account or for everyone selected. */
export function ActiveUntilDialog({
  title,
  current,
  saveLabel = "Simpan",
  onClose,
  onSave,
}: ActiveUntilDialogProps) {
  const [value, setValue] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);
  const valid = activeUntilValid(value);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="gap-4 sm:max-w-md">
        <div className="grid gap-1">
          <DialogTitle className="font-display text-lg font-semibold">
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Pilih tanpa batas waktu atau tanggal terakhir akun bisa dipakai.
          </DialogDescription>
        </div>
        <ActiveUntilField value={value} onChange={setValue} />
        {value !== null && value !== "" && !valid ? (
          <p className="text-xs text-destructive">
            Tanggal sudah lewat. Pilih hari ini atau sesudahnya.
          </p>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            className="min-h-11 sm:min-h-9"
            disabled={saving}
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            className="min-h-11 sm:min-h-9"
            disabled={!valid || saving}
            onClick={async () => {
              setSaving(true);
              const done = await onSave(value);
              setSaving(false);
              if (done) onClose();
            }}
          >
            {saving ? "Menyimpan…" : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
