import { useEffect, useState } from "react";
import {
  LIMITED_PRACTICE_ROLES,
  PRACTICE_MODULES,
  PRACTICE_MODULE_LABELS,
  ROLES,
  normalizeRole,
  type ManagedUser,
  type PesertaLinkOption,
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
import {
  adminClient,
  getErrorMessage,
  unwrapResponse,
} from "../../../../lib/api";
import { notify } from "../../../../lib/toast";
import { formatDate, roleLabel } from "../../users-format";
import { LinkPesertaDialog } from "./LinkPesertaDialog";
import { describeRule } from "./practice-limit-format";

type Choice = "suggested" | "other" | "later";

interface ApproveDialogProps {
  user: Pick<ManagedUser, "id" | "email" | "full_name" | "role" | "created_at">;
  canGrantAdmin: boolean;
  onClose: () => void;
  onDone: () => void;
}

const pesertaLine = (option: PesertaLinkOption) =>
  [option.nama, option.batch_name, option.tim].filter(Boolean).join(" · ");

/**
 * Approve a pending account with its role and, optionally, its KTP
 * participant. An Email OJK match is only suggested; "Tautkan nanti" is
 * always available. Rejecting asks once more inside the same dialog.
 */
export function ApproveDialog({
  user,
  canGrantAdmin,
  onClose,
  onDone,
}: ApproveDialogProps) {
  const name = user.full_name || user.email;
  const [role, setRole] = useState<Role>(normalizeRole(user.role) ?? "agent");
  const [suggestion, setSuggestion] = useState<PesertaLinkOption | null>(null);
  const [other, setOther] = useState<PesertaLinkOption | null>(null);
  const [choice, setChoice] = useState<Choice>("later");
  const [picking, setPicking] = useState(false);
  const [rules, setRules] = useState<PracticeLimitsOverview["rules"]>([]);
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchApi<PesertaLinkOption[]>(`/admin/peserta-options?user_id=${user.id}`)
      .then((options) => {
        const match = options.find(
          (option) => option.email_match && !option.linked_user,
        );
        if (cancelled || !match) return;
        setSuggestion(match);
        setChoice("suggested");
      })
      .catch(() => {});
    fetchApi<PracticeLimitsOverview>("/admin/practice-limits")
      .then((overview) => {
        if (!cancelled) setRules(overview.rules);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const pesertaId =
    choice === "suggested"
      ? (suggestion?.id ?? null)
      : choice === "other"
        ? (other?.id ?? null)
        : null;

  const ruleLine = (LIMITED_PRACTICE_ROLES as readonly string[]).includes(role)
    ? rules.length
      ? `Batas latihan mengikuti aturan ${role}: ${PRACTICE_MODULES.map(
          (module) =>
            `${PRACTICE_MODULE_LABELS[module]} ${describeRule(
              rules.find((rule) => rule.module === module && rule.role === role)
                ?.daily_limit ?? 0,
            )}`,
        ).join(", ")}.`
      : null
    : "Trainer dan admin tanpa batas latihan.";

  const run = async (
    action: () => Promise<Parameters<typeof unwrapResponse>[0]>,
    success: string,
    failure: string,
  ) => {
    setSaving(true);
    try {
      await unwrapResponse(await action());
      notify.success(success);
      onDone();
    } catch (err) {
      notify.error(getErrorMessage(err, failure));
    } finally {
      setSaving(false);
    }
  };

  const approve = () =>
    run(
      () =>
        adminClient.users[":id"].approve.$post({
          param: { id: user.id },
          json: { role, peserta_id: pesertaId },
        }),
      `${name} disetujui`,
      "Pendaftaran belum bisa disetujui.",
    );

  const reject = () =>
    run(
      () =>
        adminClient.users[":id"].status.$put({
          param: { id: user.id },
          json: { status: "rejected" },
        }),
      "Pendaftaran ditolak",
      "Pendaftaran belum bisa ditolak.",
    );

  if (picking)
    return (
      <LinkPesertaDialog
        account={{ id: user.id, name, email: user.email }}
        currentPesertaId={null}
        saving={false}
        onClose={() => setPicking(false)}
        onLink={(_id, option) => {
          if (option) {
            setOther(option);
            setChoice("other");
          }
          setPicking(false);
        }}
      />
    );

  const radio = (value: Choice, label: string, hint?: string) => (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
      <input
        type="radio"
        name="approve-peserta"
        value={value}
        checked={choice === value}
        onChange={() =>
          value === "other" && !other ? setPicking(true) : setChoice(value)
        }
        className="mt-0.5 size-4 accent-foreground"
      />
      <span className="grid gap-0.5">
        <span className="text-foreground">{label}</span>
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
            {rejecting ? `Tolak pendaftaran ${name}?` : `Setujui ${name}?`}
          </DialogTitle>
          <DialogDescription>
            {rejecting
              ? "Akun menjadi nonaktif dan tidak bisa masuk sampai dipulihkan."
              : `${user.email} · mendaftar ${formatDate(user.created_at)}`}
          </DialogDescription>
        </div>

        {rejecting ? null : (
          <>
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Role</span>
              <Select
                value={role}
                onValueChange={(next) => next && setRole(next as Role)}
              >
                <SelectTrigger aria-label="Role" className="h-11 w-full sm:h-9">
                  <SelectValue>{roleLabel(role)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter(
                    (entry) => entry !== "admin" || canGrantAdmin,
                  ).map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {roleLabel(entry)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <fieldset className="grid">
              <legend className="mb-1 text-sm text-muted-foreground">
                Peserta KTP
              </legend>
              {suggestion
                ? radio(
                    "suggested",
                    pesertaLine(suggestion),
                    "Disarankan karena Email OJK sama dengan email akun.",
                  )
                : null}
              {radio(
                "other",
                other ? pesertaLine(other) : "Pilih peserta lain…",
              )}
              {other ? (
                <Button
                  variant="link"
                  className="h-auto w-fit px-7 text-xs text-muted-foreground"
                  onClick={() => setPicking(true)}
                >
                  Ganti peserta
                </Button>
              ) : null}
              {radio("later", "Tautkan nanti")}
            </fieldset>

            {ruleLine ? (
              <p className="text-xs text-muted-foreground">{ruleLine}</p>
            ) : null}
          </>
        )}

        <DialogFooter className="sm:justify-between">
          {rejecting ? (
            <>
              <Button
                variant="outline"
                className="min-h-11 sm:min-h-9"
                disabled={saving}
                onClick={() => setRejecting(false)}
              >
                Kembali
              </Button>
              <Button
                variant="destructive"
                className="min-h-11 sm:min-h-9"
                disabled={saving}
                onClick={() => void reject()}
              >
                Tolak
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="min-h-11 sm:min-h-9"
                disabled={saving}
                onClick={() => setRejecting(true)}
              >
                Tolak…
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
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
                  disabled={saving || (choice === "other" && !other)}
                  onClick={() => void approve()}
                >
                  {saving ? "Menyetujui…" : "Setujui"}
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
