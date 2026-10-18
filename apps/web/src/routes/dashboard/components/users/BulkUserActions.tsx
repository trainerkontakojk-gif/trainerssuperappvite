import { useState } from "react";
import {
  LIMITED_PRACTICE_ROLES,
  normalizeRole,
  type BulkUserResponse,
  type BulkUserResult,
  type ManagedUser,
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
  adminClient,
  getErrorMessage,
  unwrapResponse,
} from "../../../../lib/api";
import { notify } from "../../../../lib/toast";
import { ConfirmDialog } from "../management/ConfirmDialog";
import { normalizeStatus } from "../../users-format";
import { ActiveUntilDialog } from "./ActiveUntilDialog";
import { BulkApproveDialog } from "./BulkApproveDialog";
import { LimitDialog, type LimitTarget } from "./LimitDialog";

type Open = "approve" | "limit" | "until" | "suspend" | null;

interface BulkUserActionsProps {
  selected: ManagedUser[];
  canGrantAdmin: boolean;
  canManageLimits: boolean;
  /** Called after a bulk action with the accounts that failed (kept selected). */
  onDone: (failedIds: string[]) => void;
  onClear: () => void;
}

const isLimited = (entry: ManagedUser) =>
  (LIMITED_PRACTICE_ROLES as readonly string[]).includes(
    normalizeRole(entry.role) ?? "",
  );

const toTarget = (entry: ManagedUser): LimitTarget => ({
  id: entry.id,
  name: entry.full_name || entry.email,
  role: normalizeRole(entry.role) ?? "agent",
});

/**
 * The action bar under the users list once rows are checked: approve, practice
 * limit, masa aktif, or suspend everyone selected. An action that does not fit
 * everyone stays visible but says why it is off. The result names each person
 * who was not changed and why.
 */
export function BulkUserActions({
  selected,
  canGrantAdmin,
  canManageLimits,
  onDone,
  onClear,
}: BulkUserActionsProps) {
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    verb: string;
    rows: BulkUserResult[];
  } | null>(null);

  const ids = selected.map((entry) => entry.id);
  const allPending = selected.every(
    (entry) => normalizeStatus(entry.status) === "pending",
  );
  const allActive = selected.every(
    (entry) => normalizeStatus(entry.status) === "active",
  );
  const limitTargets = selected.filter(isLimited).map(toTarget);
  const limitSkipped = selected
    .filter((entry) => !isLimited(entry))
    .map(toTarget);

  /** Runs one bulk request; false keeps the dialog open after an error. */
  const run = async (
    verb: string,
    request: () => Promise<Parameters<typeof unwrapResponse>[0]>,
  ): Promise<boolean> => {
    setBusy(true);
    try {
      const { results } = (await unwrapResponse(
        await request(),
      )) as BulkUserResponse;
      setOpen(null);
      setResult({ verb, rows: results });
      onDone(results.filter((row) => !row.ok).map((row) => row.user_id));
      return true;
    } catch (err) {
      notify.error(
        getErrorMessage(err, "Aksi belum bisa dijalankan. Coba lagi."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const action = (
    key: Exclude<Open, null>,
    label: string,
    offReason: string | null,
  ) => (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11 border-background/30 bg-background/10 text-background hover:bg-background/20 hover:text-background aria-disabled:opacity-60 sm:min-h-8"
      aria-disabled={offReason ? true : undefined}
      title={offReason ?? undefined}
      onClick={() => (offReason ? notify.info(offReason) : setOpen(key))}
    >
      {label}
    </Button>
  );

  const succeeded = result?.rows.filter((row) => row.ok) ?? [];
  const failed = result?.rows.filter((row) => !row.ok) ?? [];

  return (
    <>
      {selected.length ? (
        <div
          role="toolbar"
          aria-label="Aksi untuk pengguna yang dipilih"
          className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-foreground px-3 py-2 text-background shadow-lg"
        >
          <span className="mr-1 text-sm font-semibold tabular-nums">
            {selected.length} dipilih
          </span>
          {action(
            "approve",
            "Setujui",
            allPending ? null : "Hanya untuk akun yang masih Menunggu.",
          )}
          {canManageLimits
            ? action(
                "limit",
                "Batas latihan",
                limitTargets.length
                  ? null
                  : "Trainer dan admin selalu tanpa batas latihan.",
              )
            : null}
          {action("until", "Masa aktif", null)}
          {action(
            "suspend",
            "Tangguhkan",
            allActive ? null : "Hanya untuk akun yang aktif.",
          )}
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 text-background hover:bg-background/20 hover:text-background sm:min-h-8"
            onClick={onClear}
          >
            Batal pilih
          </Button>
        </div>
      ) : null}

      {open === "approve" ? (
        <BulkApproveDialog
          users={selected}
          canGrantAdmin={canGrantAdmin}
          onClose={() => setOpen(null)}
          onSubmit={(input) =>
            run("disetujui", () =>
              adminClient.users["bulk-approve"].$post({
                json: { user_ids: ids, ...input },
              }),
            )
          }
        />
      ) : null}

      {open === "limit" ? (
        <LimitDialog
          target={null}
          module="ketik"
          current={null}
          roleLimit={() => 0}
          onClose={() => setOpen(null)}
          onSaved={() => setOpen(null)}
          bulk={{
            targets: limitTargets,
            skipped: limitSkipped,
            onSave: (module, limit) =>
              run("diubah batas latihannya", () =>
                adminClient.users["bulk-practice-limit"].$post({
                  json: {
                    user_ids: limitTargets.map((entry) => entry.id),
                    module,
                    limit,
                  },
                }),
              ),
          }}
        />
      ) : null}

      {open === "until" ? (
        <ActiveUntilDialog
          title={`Masa aktif untuk ${selected.length} orang`}
          current={null}
          saveLabel={`Simpan untuk ${selected.length} orang`}
          onClose={() => setOpen(null)}
          onSave={(day) =>
            run("diubah masa aktifnya", () =>
              adminClient.users["bulk-active-until"].$post({
                json: { user_ids: ids, active_until: day },
              }),
            )
          }
        />
      ) : null}

      {open === "suspend" ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next && !busy) setOpen(null);
          }}
          title={`Tangguhkan ${selected.length} akun?`}
          description="Akun kembali ke antrean Menunggu dan tidak bisa masuk sampai disetujui lagi. Login yang masih terbuka di perangkat lain langsung berakhir."
          confirmLabel={`Tangguhkan ${selected.length} akun`}
          tone="destructive"
          pending={busy}
          onConfirm={async () => {
            await run("ditangguhkan", () =>
              adminClient.users["bulk-suspend"].$post({
                json: { user_ids: ids },
              }),
            );
          }}
        />
      ) : null}

      {result ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setResult(null);
          }}
        >
          <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-md">
            <div className="grid gap-1">
              <DialogTitle className="font-display text-lg font-semibold">
                Selesai: {succeeded.length} dari {result.rows.length}{" "}
                {result.verb}
              </DialogTitle>
              <DialogDescription>
                {failed.length
                  ? "Yang tidak berhasil tetap dipilih supaya bisa dicoba lagi."
                  : "Semua yang dipilih berhasil diproses."}
              </DialogDescription>
            </div>
            <dl className="grid gap-3 text-sm">
              {succeeded.length ? (
                <div className="grid gap-1">
                  <dt className="text-muted-foreground">Berhasil</dt>
                  <dd>{succeeded.map((row) => row.name).join(", ")}</dd>
                </div>
              ) : null}
              {failed.length ? (
                <div className="grid gap-1">
                  <dt className="text-destructive">Tidak berhasil</dt>
                  <dd>
                    <ul className="grid gap-1">
                      {failed.map((row) => (
                        <li key={row.user_id}>
                          {row.name}: {row.error}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
            </dl>
            <DialogFooter>
              <Button
                className="min-h-11 sm:min-h-9"
                onClick={() => setResult(null)}
              >
                Tutup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
