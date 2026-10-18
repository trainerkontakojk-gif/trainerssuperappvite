import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import {
  LIMITED_PRACTICE_ROLES,
  PRACTICE_LIMIT_MAX,
  PRACTICE_MODULES,
  PRACTICE_MODULE_LABELS,
  formatPracticeLimit,
  normalizeRole,
  type LimitedPracticeRole,
  type ManagedUser,
  type PracticeLimitOverride,
  type PracticeLimitsOverview,
  type PracticeModule,
} from "@trainers/types";
import { useApi, fetchApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { ManagementShell } from "./components/management/ManagementShell";
import { EmptyState } from "./components/management/EmptyState";
import { LimitDialog, type LimitTarget } from "./components/users/LimitDialog";
import {
  COUNTED_ACTION,
  formatLimitDay,
} from "./components/users/practice-limit-format";
import { normalizeStatus, roleLabel } from "./users-format";

const RULE_CHOICES = [
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  8,
  10,
  15,
  20,
  30,
  PRACTICE_LIMIT_MAX,
];
const UNLIMITED = "unlimited";
type RuleKey = `${PracticeModule}:${LimitedPracticeRole}`;

function choiceValue(limit: number | null) {
  return limit === null ? UNLIMITED : String(limit);
}

type Editing =
  | { kind: "existing"; override: PracticeLimitOverride }
  | { kind: "new"; candidates: LimitTarget[] };

/**
 * Daily practice limits: role rules for agent and leader, and per-user
 * exceptions still in force. Trainer and admin are always unlimited.
 */
export default function PracticeLimitsPage() {
  const { data, loading, error, refetch } = useApi<PracticeLimitsOverview>(
    "/admin/practice-limits",
  );
  const [draft, setDraft] = useState<Partial<Record<RuleKey, number | null>>>(
    {},
  );
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  const saved = useMemo(() => {
    const map: Partial<Record<RuleKey, number | null>> = {};
    for (const rule of data?.rules ?? [])
      if ((LIMITED_PRACTICE_ROLES as readonly string[]).includes(rule.role))
        map[`${rule.module}:${rule.role as LimitedPracticeRole}`] =
          rule.daily_limit;
    return map;
  }, [data]);
  useEffect(() => setDraft(saved), [saved]);

  const changed = (Object.keys(draft) as RuleKey[]).filter(
    (key) => draft[key] !== saved[key],
  );
  const roleLimit = (role: string, module: PracticeModule) =>
    data?.rules.find(
      (rule) => rule.module === module && rule.role === normalizeRole(role),
    )?.daily_limit ?? 0;

  const saveRules = async () => {
    setSaving(true);
    try {
      await unwrapResponse(
        await adminClient["practice-limits"].rules.$put({
          json: {
            rules: changed.map((key) => {
              const [module, role] = key.split(":") as [
                PracticeModule,
                LimitedPracticeRole,
              ];
              return { module, role, daily_limit: draft[key] ?? null };
            }),
          },
        }),
      );
      notify.success("Aturan batas latihan disimpan");
      await refetch();
    } catch (err) {
      notify.error(getErrorMessage(err, "Aturan belum tersimpan."));
    } finally {
      setSaving(false);
    }
  };

  const addException = async () => {
    try {
      const users = await fetchApi<ManagedUser[]>("/admin/users");
      setEditing({
        kind: "new",
        candidates: users
          .filter(
            (user) =>
              normalizeStatus(user.status) === "active" &&
              (LIMITED_PRACTICE_ROLES as readonly string[]).includes(
                normalizeRole(user.role) ?? "",
              ),
          )
          .map((user) => ({
            id: user.id,
            name: user.full_name || user.email,
            role: user.role,
          })),
      });
    } catch (err) {
      notify.error(getErrorMessage(err, "Daftar pengguna belum bisa dimuat."));
    }
  };

  const today = data?.today;
  const totalStarted = today
    ? PRACTICE_MODULES.reduce((sum, module) => sum + today.started[module], 0)
    : 0;
  const todayLabel = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });

  const ruleCell = (module: PracticeModule, role: LimitedPracticeRole) => {
    const key: RuleKey = `${module}:${role}`;
    const value = draft[key] ?? null;
    const choices = RULE_CHOICES.includes(value ?? -1)
      ? RULE_CHOICES
      : [...RULE_CHOICES, value ?? 0].sort((a, b) => a - b);
    return (
      <Select
        value={choiceValue(value)}
        onValueChange={(next) =>
          setDraft((current) => ({
            ...current,
            [key]: next === UNLIMITED ? null : Number(next),
          }))
        }
        disabled={saving}
      >
        <SelectTrigger
          aria-label={`${PRACTICE_MODULE_LABELS[module]} untuk ${roleLabel(role)}`}
          className="h-11 w-36 sm:h-9"
        >
          <SelectValue>{formatPracticeLimit(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice} value={String(choice)}>
              {formatPracticeLimit(choice)}
            </SelectItem>
          ))}
          <SelectItem value={UNLIMITED}>Tanpa batas</SelectItem>
        </SelectContent>
      </Select>
    );
  };

  return (
    <ManagementShell
      title="Batas latihan"
      description="Berapa kali per hari setiap peran boleh memulai simulasi. Dihitung per tanggal WIB dan diperiksa di server."
      actions={
        <Button
          className="min-h-11 sm:min-h-9"
          disabled={!changed.length || saving}
          onClick={() => void saveRules()}
        >
          {saving ? "Menyimpan…" : "Simpan aturan"}
        </Button>
      }
    >
      {error && !data ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          {error}
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => void refetch()}
          >
            Coba lagi
          </Button>
        </div>
      ) : !data ? (
        <div role="status" aria-busy={loading} className="grid gap-3">
          <span className="sr-only">Memuat batas latihan…</span>
          <Skeleton className="h-6 w-80" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              Hari ini {todayLabel}:{" "}
              <strong className="font-semibold text-foreground tabular-nums">
                {totalStarted}
              </strong>{" "}
              simulasi dimulai
            </span>
            {PRACTICE_MODULES.map((module) => (
              <span key={module}>
                {PRACTICE_MODULE_LABELS[module]}{" "}
                <strong className="font-semibold text-foreground tabular-nums">
                  {today!.started[module]}
                </strong>
              </span>
            ))}
            <span>
              <strong className="font-semibold text-foreground tabular-nums">
                {today!.users_at_limit}
              </strong>{" "}
              orang sudah mencapai batas
            </span>
          </p>

          <section aria-labelledby="aturan-peran" className="grid gap-3">
            <h2
              id="aturan-peran"
              className="text-base font-semibold text-foreground"
            >
              Aturan per peran
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4 text-xs text-muted-foreground">
                      Modul
                    </TableHead>
                    <TableHead className="px-4 text-xs text-muted-foreground">
                      Yang dihitung
                    </TableHead>
                    <TableHead className="px-4 text-xs text-muted-foreground">
                      Agent
                    </TableHead>
                    <TableHead className="px-4 text-xs text-muted-foreground">
                      Leader
                    </TableHead>
                    <TableHead className="px-4 text-xs text-muted-foreground">
                      Trainer
                    </TableHead>
                    <TableHead className="px-4 text-xs text-muted-foreground">
                      Admin
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PRACTICE_MODULES.map((module) => (
                    <TableRow key={module} className="hover:bg-transparent">
                      <TableCell className="px-4 py-2 font-medium">
                        {PRACTICE_MODULE_LABELS[module]}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-sm text-muted-foreground">
                        {COUNTED_ACTION[module]}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        {ruleCell(module, "agent")}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        {ruleCell(module, "leader")}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-sm text-muted-foreground">
                        Tanpa batas
                      </TableCell>
                      <TableCell className="px-4 py-2 text-sm text-muted-foreground">
                        Tanpa batas
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Trainer dan admin selalu tanpa batas. Aturan baru langsung berlaku
              untuk semua agent atau leader setelah disimpan.
            </p>
          </section>

          <section aria-labelledby="pengecualian" className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="pengecualian"
                className="text-base font-semibold text-foreground"
              >
                Pengecualian per pengguna
              </h2>
              <Button
                variant="outline"
                className="min-h-11 gap-1.5 sm:min-h-9"
                onClick={() => void addException()}
              >
                <Plus aria-hidden="true" className="size-4" />
                Tambah pengecualian
              </Button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              {data.overrides.length === 0 ? (
                <EmptyState
                  title="Belum ada pengecualian"
                  description="Semua agent dan leader mengikuti aturan peran di atas."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="px-4 text-xs text-muted-foreground">
                        Pengguna
                      </TableHead>
                      <TableHead className="px-4 text-xs text-muted-foreground">
                        Modul
                      </TableHead>
                      <TableHead className="px-4 text-xs text-muted-foreground">
                        Batas
                      </TableHead>
                      <TableHead className="px-4 text-xs text-muted-foreground">
                        Sampai
                      </TableHead>
                      <TableHead className="hidden px-4 text-xs text-muted-foreground md:table-cell">
                        Catatan
                      </TableHead>
                      <TableHead className="hidden px-4 text-xs text-muted-foreground lg:table-cell">
                        Diubah oleh
                      </TableHead>
                      <TableHead className="px-4">
                        <span className="sr-only">Ubah</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.overrides.map((override) => (
                      <TableRow
                        key={override.id}
                        className="cursor-pointer"
                        onClick={() =>
                          setEditing({ kind: "existing", override })
                        }
                      >
                        <TableCell className="px-4 py-3">
                          <span className="font-medium text-foreground">
                            {override.user_name}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            · {roleLabel(override.user_role)}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                          {PRACTICE_MODULE_LABELS[override.module]}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          {formatPracticeLimit(override.daily_limit)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                          {override.ends_on
                            ? formatLimitDay(override.ends_on)
                            : "-"}
                        </TableCell>
                        <TableCell className="hidden max-w-60 truncate px-4 py-3 text-sm text-muted-foreground md:table-cell">
                          {override.note ?? "-"}
                        </TableCell>
                        <TableCell className="hidden px-4 py-3 text-sm text-muted-foreground lg:table-cell">
                          {[
                            override.updated_by_name,
                            formatLimitDay(
                              override.updated_at.slice(0, 10),
                              false,
                            ),
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Ubah batas ${PRACTICE_MODULE_LABELS[override.module]} ${override.user_name}`}
                            className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditing({ kind: "existing", override });
                            }}
                          >
                            <ChevronRight
                              aria-hidden="true"
                              className="size-4"
                            />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </section>
        </>
      )}

      {editing ? (
        <LimitDialog
          target={
            editing.kind === "existing"
              ? {
                  id: editing.override.user_id,
                  name: editing.override.user_name,
                  role: editing.override.user_role,
                }
              : null
          }
          candidates={editing.kind === "new" ? editing.candidates : undefined}
          module={
            editing.kind === "existing" ? editing.override.module : "telefun"
          }
          current={editing.kind === "existing" ? editing.override : null}
          roleLimit={roleLimit}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refetch();
          }}
        />
      ) : null}
    </ManagementShell>
  );
}
