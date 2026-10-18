import { useState } from "react";
import {
  PRACTICE_MODULE_LABELS,
  formatPracticeLimit,
  type UserPracticeLimit,
} from "@trainers/types";
import { Button } from "../../../../components/ui/button";
import { LimitDialog, type LimitTarget } from "./LimitDialog";
import { formatLimitDay } from "./practice-limit-format";

interface UserPracticeLimitsProps {
  account: LimitTarget;
  limits: UserPracticeLimit[];
  /** Agent and leader only; trainer and admin are always unlimited. */
  editable: boolean;
  onSaved: () => void;
}

function ruleText(entry: UserPracticeLimit): string {
  if (entry.source === "role") return "Aturan peran";
  const until = entry.ends_on
    ? `sampai ${formatLimitDay(entry.ends_on)}`
    : "sampai dihapus";
  return `Pengecualian ${until}${entry.note ? ` · ${entry.note}` : ""}`;
}

/** Today's limit per module on the user page, with "Ubah" per row. */
export function UserPracticeLimits({
  account,
  limits,
  editable,
  onSaved,
}: UserPracticeLimitsProps) {
  const [editing, setEditing] = useState<UserPracticeLimit | null>(null);

  if (!editable) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        Tanpa batas. Trainer dan admin selalu bisa mulai KETIK, PDKT, dan
        Telefun.
      </p>
    );
  }

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 font-medium">Modul</th>
            <th className="py-2 font-medium">Per hari</th>
            <th className="py-2 font-medium">Hari ini</th>
            <th className="hidden py-2 font-medium sm:table-cell">Aturan</th>
            <th className="py-2">
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {limits.map((entry) => (
            <tr
              key={entry.module}
              className="border-b border-border last:border-b-0"
            >
              <td className="py-2.5 font-medium text-foreground">
                {PRACTICE_MODULE_LABELS[entry.module]}
              </td>
              <td className="py-2.5 text-foreground">
                {formatPracticeLimit(entry.limit)}
              </td>
              <td className="py-2.5 tabular-nums text-muted-foreground">
                {entry.limit === null
                  ? entry.used
                  : `${entry.used} dari ${entry.limit}`}
              </td>
              <td className="hidden py-2.5 text-muted-foreground sm:table-cell">
                {ruleText(entry)}
              </td>
              <td className="py-1 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 sm:min-h-8"
                  aria-label={`Ubah batas ${PRACTICE_MODULE_LABELS[entry.module]}`}
                  onClick={() => setEditing(entry)}
                >
                  Ubah
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="py-2.5 text-xs text-muted-foreground">
        Hitungan kembali ke nol setiap 00.00 WIB.
      </p>

      {editing ? (
        <LimitDialog
          target={account}
          module={editing.module}
          current={
            editing.source === "override"
              ? {
                  daily_limit: editing.limit,
                  ends_on: editing.ends_on,
                  note: editing.note,
                }
              : null
          }
          roleLimit={(_, module) =>
            limits.find((entry) => entry.module === module)?.role_limit ?? 0
          }
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
        />
      ) : null}
    </>
  );
}
