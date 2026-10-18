import { useState, type ReactNode } from "react";
import {
  PRACTICE_LIMIT_MAX,
  PRACTICE_MODULE_LABELS,
  PRACTICE_MODULES,
  type PracticeModule,
} from "@trainers/types";
import { Button } from "../../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import {
  adminClient,
  getErrorMessage,
  unwrapResponse,
} from "../../../../lib/api";
import { notify } from "../../../../lib/toast";
import { roleLabel } from "../../users-format";
import { describeRule, wibToday } from "./practice-limit-format";

type Mode = "role" | "custom" | "unlimited" | "closed";

export interface LimitTarget {
  id: string;
  name: string;
  role: string;
}

export interface LimitDialogProps {
  /** Fixed account, or null to pick one from `candidates`. */
  target: LimitTarget | null;
  candidates?: LimitTarget[];
  module: PracticeModule;
  /** The exception in force now, or null when the role rule applies. */
  current: {
    daily_limit: number | null;
    ends_on: string | null;
    note: string | null;
  } | null;
  /** Role rule per role and module, for the description line. */
  roleLimit: (role: string, module: PracticeModule) => number | null;
  onClose: () => void;
  onSaved: () => void;
  /** Same limit for everyone selected on the users list. */
  bulk?: {
    /** Agents and leaders who will be changed. */
    targets: LimitTarget[];
    /** Selected but always unlimited (trainer, admin). */
    skipped: LimitTarget[];
    onSave: (
      module: PracticeModule,
      limit: LimitPayload | null,
    ) => Promise<boolean>;
  };
}

export type LimitPayload = {
  daily_limit: number | null;
  ends_on: string | null;
  note: string | null;
};

function initialMode(current: LimitDialogProps["current"]): Mode {
  if (!current) return "role";
  if (current.daily_limit === null) return "unlimited";
  return current.daily_limit === 0 ? "closed" : "custom";
}

/**
 * One person's limit for one module: follow the role rule, a custom number
 * per day, unlimited, or closed, optionally until a date (WIB).
 */
export function LimitDialog({
  target: fixedTarget,
  candidates = [],
  module: initialModule,
  current,
  roleLimit,
  onClose,
  onSaved,
  bulk,
}: LimitDialogProps) {
  const [targetId, setTargetId] = useState(fixedTarget?.id ?? "");
  const [module, setModule] = useState<PracticeModule>(initialModule);
  const [mode, setMode] = useState<Mode>(initialMode(current));
  const [count, setCount] = useState(
    String(
      current?.daily_limit && current.daily_limit > 0 ? current.daily_limit : 1,
    ),
  );
  const [endsOn, setEndsOn] = useState(current?.ends_on ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  const [saving, setSaving] = useState(false);

  const target =
    fixedTarget ??
    candidates.find((candidate) => candidate.id === targetId) ??
    null;
  const label = PRACTICE_MODULE_LABELS[module];
  const countValue = Number(count);
  const countValid =
    Number.isInteger(countValue) &&
    countValue >= 1 &&
    countValue <= PRACTICE_LIMIT_MAX;
  const canSave =
    (bulk ? bulk.targets.length > 0 : Boolean(target)) &&
    (mode !== "custom" || countValid);
  const payload: LimitPayload | null =
    mode === "role"
      ? null
      : {
          daily_limit:
            mode === "unlimited" ? null : mode === "closed" ? 0 : countValue,
          ends_on: endsOn || null,
          note: note.trim() || null,
        };

  const save = async () => {
    if (bulk) {
      setSaving(true);
      if (!(await bulk.onSave(module, payload))) setSaving(false);
      return;
    }
    if (!target) return;
    setSaving(true);
    try {
      const param = { id: target.id, module };
      if (!payload) {
        await unwrapResponse(
          await adminClient.users[":id"]["practice-limits"][":module"].$delete({
            param,
          }),
        );
      } else {
        await unwrapResponse(
          await adminClient.users[":id"]["practice-limits"][":module"].$put({
            param,
            json: payload,
          }),
        );
      }
      notify.success(`Batas ${label} untuk ${target.name} disimpan`);
      onSaved();
    } catch (err) {
      notify.error(getErrorMessage(err, "Batas latihan belum tersimpan."));
    } finally {
      setSaving(false);
    }
  };

  const option = (value: Mode, content: ReactNode, hint?: string) => (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
      <input
        type="radio"
        name="limit-mode"
        value={value}
        checked={mode === value}
        onChange={() => setMode(value)}
        className="mt-0.5 size-4 accent-foreground"
      />
      <span className="grid gap-0.5">
        <span className="text-foreground">{content}</span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
    </label>
  );

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
            {bulk
              ? `Batas latihan untuk ${bulk.targets.length + bulk.skipped.length} orang`
              : target
                ? `Batas ${label} untuk ${target.name}`
                : "Tambah pengecualian"}
          </DialogTitle>
          <DialogDescription>
            {bulk
              ? "Pilih modul, lalu tentukan batas yang sama untuk semuanya."
              : target
                ? `Aturan ${roleLabel(target.role).toLowerCase()}: ${describeRule(roleLimit(target.role, module))}`
                : "Pilih pengguna dan modul, lalu tentukan batasnya."}
          </DialogDescription>
        </div>

        {fixedTarget ? null : (
          <div
            className={
              bulk
                ? "grid gap-3"
                : "grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]"
            }
          >
            {bulk ? null : (
              <label className="grid gap-1.5 text-sm">
                <span className="text-muted-foreground">Pengguna</span>
                <Select
                  value={targetId}
                  onValueChange={(next) => setTargetId(String(next ?? ""))}
                >
                  <SelectTrigger
                    aria-label="Pengguna"
                    className="h-11 w-full sm:h-9"
                  >
                    <SelectValue>
                      {target?.name ?? "Pilih pengguna"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name} · {roleLabel(candidate.role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Modul</span>
              <Select
                value={module}
                onValueChange={(next) =>
                  next && setModule(next as PracticeModule)
                }
              >
                <SelectTrigger
                  aria-label="Modul"
                  className="h-11 w-full sm:h-9"
                >
                  <SelectValue>{label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRACTICE_MODULES.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {PRACTICE_MODULE_LABELS[entry]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        )}

        <fieldset className="grid">
          <legend className="sr-only">Batas {label}</legend>
          {option(
            "role",
            "Ikuti aturan peran",
            bulk ? `Menghapus pengecualian ${label} mereka.` : undefined,
          )}
          {option(
            "custom",
            <span className="inline-flex flex-wrap items-center gap-2">
              Batas khusus
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={PRACTICE_LIMIT_MAX}
                aria-label="Jumlah per hari"
                value={count}
                onFocus={() => setMode("custom")}
                onChange={(event) => setCount(event.target.value)}
                aria-invalid={mode === "custom" && !countValid}
                className="h-9 w-16"
              />
              kali per hari
            </span>,
            mode === "custom" && !countValid
              ? `Isi angka 1 sampai ${PRACTICE_LIMIT_MAX}.`
              : undefined,
          )}
          {option("unlimited", "Tanpa batas")}
          {option(
            "closed",
            "Tutup",
            `Tidak bisa memulai ${label} walau aturan peran mengizinkan.`,
          )}
        </fieldset>

        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Berlaku sampai</span>
          <Input
            type="date"
            min={wibToday()}
            value={endsOn}
            disabled={mode === "role"}
            onChange={(event) => setEndsOn(event.target.value)}
            className="h-11 sm:h-9"
          />
          <span className="text-xs text-muted-foreground">
            Kosongkan untuk berlaku seterusnya. Setelah tanggal ini kembali ke
            aturan peran.
          </span>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Catatan</span>
          <Input
            value={note}
            maxLength={200}
            disabled={mode === "role"}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Misalnya: persiapan sertifikasi"
            className="h-11 sm:h-9"
          />
        </label>

        {bulk?.skipped.length ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {bulk.skipped.length} orang dilewati:{" "}
            {bulk.skipped
              .map(
                (entry) =>
                  `${entry.name} (${roleLabel(entry.role).toLowerCase()})`,
              )
              .join(", ")}{" "}
            selalu tanpa batas.
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
            disabled={!canSave || saving}
            onClick={() => void save()}
          >
            {saving
              ? "Menyimpan…"
              : bulk
                ? `Simpan untuk ${bulk.targets.length} orang`
                : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
