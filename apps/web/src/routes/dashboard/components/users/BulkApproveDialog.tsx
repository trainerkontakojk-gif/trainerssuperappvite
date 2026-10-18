import { useEffect, useState } from "react";
import {
  ROLES,
  activeUntilValid,
  normalizeRole,
  type ManagedUser,
  type PesertaSuggestion,
  type PracticeLimitsOverview,
  type Role,
} from "@trainers/types";
import { Button } from "../../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../../../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { fetchApi } from "../../../../hooks/useApi";
import { adminClient, unwrapResponse } from "../../../../lib/api";
import { roleLabel } from "../../users-format";
import { ActiveUntilField } from "./ActiveUntilDialog";
import { roleRuleLine } from "./practice-limit-format";

export interface BulkApproveInput {
  role: Role;
  active_until: string | null;
  links: { user_id: string; peserta_id: string }[];
}

interface BulkApproveDialogProps {
  users: ManagedUser[];
  canGrantAdmin: boolean;
  onClose: () => void;
  onSubmit: (input: BulkApproveInput) => Promise<boolean>;
}

/**
 * Approve a batch: one role and one masa aktif for everyone. Participants
 * whose Email OJK equals the account email are suggested per person and
 * checked by default; unchecking leaves that person to link later.
 */
export function BulkApproveDialog({
  users,
  canGrantAdmin,
  onClose,
  onSubmit,
}: BulkApproveDialogProps) {
  const roles = new Set(users.map((entry) => normalizeRole(entry.role)));
  const shared = roles.size === 1 ? [...roles][0] : null;
  const [role, setRole] = useState<Role>(
    shared && (shared !== "admin" || canGrantAdmin) ? shared : "agent",
  );
  const [activeUntil, setActiveUntil] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PesertaSuggestion[] | null>(
    null,
  );
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<PracticeLimitsOverview["rules"]>([]);
  const [saving, setSaving] = useState(false);

  const ids = users.map((entry) => entry.id).join(",");
  useEffect(() => {
    let cancelled = false;
    adminClient.users["bulk-peserta-suggestions"]
      .$post({ json: { user_ids: ids.split(",") } })
      .then(unwrapResponse)
      .then((rows) => {
        if (!cancelled) setSuggestions(rows);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    fetchApi<PracticeLimitsOverview>("/admin/practice-limits")
      .then((overview) => {
        if (!cancelled) setRules(overview.rules);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const suggestionOf = new Map(
    (suggestions ?? []).map((row) => [row.user_id, row.peserta]),
  );
  const ruleLine = roleRuleLine(role, rules);

  const submit = async () => {
    setSaving(true);
    const links = users.flatMap((entry) => {
      const peserta = suggestionOf.get(entry.id);
      return peserta && !unchecked.has(entry.id)
        ? [{ user_id: entry.id, peserta_id: peserta.id }]
        : [];
    });
    if (!(await onSubmit({ role, active_until: activeUntil, links })))
      setSaving(false);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-lg">
        <div className="grid gap-1">
          <DialogTitle className="font-display text-lg font-semibold">
            Setujui {users.length} pendaftaran?
          </DialogTitle>
          <DialogDescription className="sr-only">
            Pilih satu role dan masa aktif untuk semua, lalu periksa saran
            peserta KTP.
          </DialogDescription>
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Role untuk semua</span>
          <Select
            value={role}
            onValueChange={(next) => next && setRole(next as Role)}
          >
            <SelectTrigger
              aria-label="Role untuk semua"
              className="h-11 w-full sm:h-9"
            >
              <SelectValue>{roleLabel(role)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ROLES.filter((entry) => entry !== "admin" || canGrantAdmin).map(
                (entry) => (
                  <SelectItem key={entry} value={entry}>
                    {roleLabel(entry)}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </label>

        <ActiveUntilField
          value={activeUntil}
          onChange={setActiveUntil}
          hint="Pilih tanggal kalau akun-akun ini hanya untuk satu batch pelatihan."
        />

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm text-muted-foreground">
            Peserta KTP · disarankan dari Email OJK yang sama
          </legend>
          {suggestions === null ? (
            <p role="status" className="text-sm text-muted-foreground">
              Mencari peserta yang cocok…
            </p>
          ) : (
            <ul className="grid gap-1 rounded-lg border border-border px-3 py-1.5">
              {users.map((entry) => {
                const name = entry.full_name || entry.email;
                const peserta = suggestionOf.get(entry.id);
                return (
                  <li key={entry.id} className="text-sm">
                    {peserta ? (
                      <label className="flex min-h-11 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          aria-label={`Tautkan ${name} ke ${peserta.nama}`}
                          checked={!unchecked.has(entry.id)}
                          onChange={(event) =>
                            setUnchecked((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.delete(entry.id);
                              else next.add(entry.id);
                              return next;
                            })
                          }
                          className="size-4 accent-foreground"
                        />
                        <span className="min-w-0">
                          <b className="font-medium">{name}</b>{" "}
                          <span
                            aria-hidden="true"
                            className="text-muted-foreground"
                          >
                            →
                          </span>{" "}
                          {[peserta.nama, peserta.batch_name]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </label>
                    ) : (
                      <p className="flex min-h-11 items-center pl-7">
                        <span>
                          <b className="font-medium">{name}</b>
                          <span className="text-muted-foreground">
                            {" "}
                            · tidak ada yang cocok, tautkan nanti
                          </span>
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <span className="text-xs text-muted-foreground">
            Hapus centang untuk tidak menautkan orang itu. Peserta lain tetap
            ditautkan satu per satu dari halaman orangnya.
          </span>
        </fieldset>

        {ruleLine ? (
          <p className="text-xs text-muted-foreground">{ruleLine}</p>
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
            disabled={
              saving || suggestions === null || !activeUntilValid(activeUntil)
            }
            onClick={() => void submit()}
          >
            {saving ? "Menyetujui…" : `Setujui ${users.length} akun`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
