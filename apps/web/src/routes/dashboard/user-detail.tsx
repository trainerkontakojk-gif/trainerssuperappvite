import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { AlertCircle, ChevronLeft } from "lucide-react";
import {
  ROLES,
  can,
  daysLeft,
  formatWibDay,
  isAccountExpired,
  normalizeRole,
  type ManagedUserDetail,
  type Role,
} from "@trainers/types";
import { useAuthStore } from "../../store/authStore";
import { useApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { StatusDot } from "./components/management/StatusDot";
import { ConfirmDialog } from "./components/management/ConfirmDialog";
import { LinkPesertaDialog } from "./components/users/LinkPesertaDialog";
import { ApproveDialog } from "./components/users/ApproveDialog";
import { UserPracticeLimits } from "./components/users/UserPracticeLimits";
import { ActiveUntilDialog } from "./components/users/ActiveUntilDialog";
import {
  STATUS_PRESENTATION,
  displayStatus,
  formatDate,
  normalizeStatus,
  roleLabel,
} from "./users-format";

type ConfirmKind = "reject" | "suspend" | "reset" | "delete" | "unlink";

const MODULE_LABEL: Record<string, string> = {
  sidak: "SIDAK",
  ktp: "KTP",
  all: "SIDAK dan KTP",
};

function formatDateTime(value: string | null) {
  if (!value) return "Belum pernah";
  return `${new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  })} WIB`;
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action ? (
          <div className="flex items-center gap-2">{action}</div>
        ) : null}
      </div>
      <div className="px-4 py-1">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl>
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-4 border-b border-border py-2.5 text-sm last:border-b-0"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One account: role, status, KTP participant link, and change history. */
export default function UserDetailPage() {
  const { id = "" } = useParams({ strict: false }) as { id?: string };
  const navigate = useNavigate();
  const currentProfile = useAuthStore((s) => s.profile);
  const managerRole = normalizeRole(currentProfile?.role);
  const canManageAdmins = can(managerRole, "admin.users.manageAdmin");
  const canManageLimits = can(managerRole, "practice.limits.manage");

  const { data, loading, error, refetch } = useApi<ManagedUserDetail>(
    id ? `/admin/users/${id}` : null,
  );
  const [draftRole, setDraftRole] = useState<Role | "">("");
  const [busy, setBusy] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [linking, setLinking] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editingUntil, setEditingUntil] = useState(false);

  const user = data?.user;
  useEffect(() => {
    setDraftRole(normalizeRole(user?.role) ?? "");
  }, [user?.id, user?.role]);

  if (!data) {
    return (
      <div className="mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <BackLink />
        {error ? (
          <Alert variant="destructive" className="items-center">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
            <Button
              variant="ghost"
              className="ml-auto min-h-11"
              onClick={() => void refetch()}
            >
              Coba lagi
            </Button>
          </Alert>
        ) : (
          <div role="status" className="grid gap-3" aria-busy={loading}>
            <span className="sr-only">Memuat pengguna…</span>
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}
      </div>
    );
  }

  const { peserta, ketik_assignment, leader_access, history, practice_limits } =
    data;
  const account = data.user;
  const name = account.full_name || "Tanpa nama";
  const status = normalizeStatus(account.status);
  const shownStatus = STATUS_PRESENTATION[displayStatus(account)];
  const isSelf = account.id === currentProfile?.id;
  const manageable =
    !isSelf && (normalizeRole(account.role) !== "admin" || canManageAdmins);
  const roleOptions = ROLES.filter(
    (target) => target !== "admin" || canManageAdmins,
  );

  const mutate = async (
    action: () => Promise<Parameters<typeof unwrapResponse>[0]>,
    success: string,
    failure: string,
  ) => {
    setBusy(true);
    try {
      await unwrapResponse(await action());
      notify.success(success);
      await refetch();
      return true;
    } catch (err) {
      notify.error(getErrorMessage(err, failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (next: "approved" | "pending" | "rejected", msg: string) =>
    mutate(
      () =>
        adminClient.users[":id"].status.$put({
          param: { id: account.id },
          json: { status: next },
        }),
      msg,
      "Gagal memperbarui status pengguna.",
    );

  const confirmActions: Record<ConfirmKind, () => Promise<boolean>> = {
    reject: () => setStatus("rejected", "Pendaftaran ditolak"),
    suspend: () => setStatus("pending", "Pengguna ditangguhkan"),
    reset: () =>
      mutate(
        () =>
          adminClient.users[":id"]["reset-password"].$post({
            param: { id: account.id },
          }),
        `Email reset password dikirim ke ${account.email}`,
        "Gagal mengirim email reset password.",
      ),
    unlink: () =>
      mutate(
        () =>
          adminClient.users[":id"].peserta.$delete({
            param: { id: account.id },
          }),
        "Tautan peserta dilepas",
        "Gagal melepas tautan peserta.",
      ),
    delete: async () => {
      const ok = await mutate(
        () => adminClient.users[":id"].$delete({ param: { id: account.id } }),
        "Pengguna berhasil dihapus",
        "Gagal menghapus pengguna.",
      );
      if (ok) void navigate({ to: "/dashboard/users" });
      return ok;
    },
  };

  const confirmCopy: Record<
    ConfirmKind,
    { title: string; description: string; label: string; danger: boolean }
  > = {
    reject: {
      title: "Tolak pendaftaran?",
      description:
        "Akun menjadi nonaktif dan tidak bisa masuk sampai dipulihkan. Login yang masih terbuka di perangkat lain langsung berakhir.",
      label: "Tolak",
      danger: true,
    },
    suspend: {
      title: `Tangguhkan ${name}?`,
      description:
        "Akun kembali ke antrean Menunggu dan tidak bisa masuk sampai disetujui lagi. Login yang masih terbuka di perangkat lain langsung berakhir.",
      label: "Tangguhkan",
      danger: true,
    },
    reset: {
      title: "Kirim email reset password?",
      description: `Link untuk membuat password baru dikirim ke ${account.email}.`,
      label: "Kirim email",
      danger: false,
    },
    unlink: {
      title: "Lepas tautan peserta?",
      description: `${name} langsung tidak bisa melihat data SIDAK dan KTP milik ${peserta?.nama ?? "peserta ini"}.`,
      label: "Lepas tautan",
      danger: true,
    },
    delete: {
      title: "Hapus pengguna?",
      description:
        "Pengguna tidak akan bisa masuk lagi dan tautan pesertanya dilepas. Login yang masih terbuka di perangkat lain langsung berakhir.",
      label: "Hapus pengguna",
      danger: true,
    },
  };

  const statusActions = !manageable ? null : status === "pending" ? (
    <>
      <Button
        className="min-h-11 sm:min-h-9"
        disabled={busy}
        onClick={() => setApproving(true)}
      >
        Setujui
      </Button>
      <Button
        variant="outline"
        className="min-h-11 sm:min-h-9"
        disabled={busy}
        onClick={() => setConfirmKind("reject")}
      >
        Tolak
      </Button>
    </>
  ) : status === "inactive" ? (
    <Button
      variant="outline"
      className="min-h-11 sm:min-h-9"
      disabled={busy}
      onClick={() =>
        void setStatus("pending", "Pengguna dipulihkan ke antrean Menunggu")
      }
    >
      Pulihkan
    </Button>
  ) : (
    <Button
      variant="outline"
      className="min-h-11 sm:min-h-9"
      disabled={busy}
      onClick={() => setConfirmKind("suspend")}
    >
      Tangguhkan
    </Button>
  );

  const copy = confirmKind ? confirmCopy[confirmKind] : null;

  return (
    <div className="mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <BackLink />
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight break-words text-foreground">
            {name}
            {isSelf ? (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                (Anda)
              </span>
            ) : null}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="break-all">{account.email}</span>
            <span aria-hidden="true">·</span>
            <span>{roleLabel(account.role)}</span>
            <span aria-hidden="true">·</span>
            <StatusDot tone={shownStatus.tone} label={shownStatus.label} />
          </p>
        </div>
        {manageable ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {status !== "pending" ? (
              <Button
                variant="outline"
                className="min-h-11 sm:min-h-9"
                disabled={busy || !account.email}
                onClick={() => setConfirmKind("reset")}
              >
                Kirim reset password
              </Button>
            ) : null}
            {statusActions}
          </div>
        ) : null}
      </div>

      {!manageable ? (
        <p className="text-sm text-muted-foreground">
          {isSelf
            ? "Ini akun Anda. Ubah akun sendiri lewat halaman Akun."
            : "Hanya admin yang bisa mengubah akun admin."}
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="grid gap-5">
          <Panel title="Akun">
            <Rows
              rows={[
                [
                  "Role",
                  manageable ? (
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={draftRole}
                        onValueChange={(next) => {
                          if (next) setDraftRole(next as Role);
                        }}
                        disabled={busy}
                      >
                        <SelectTrigger
                          aria-label={`Role ${name}`}
                          className="h-11 w-40 sm:h-9"
                        >
                          <SelectValue>{roleLabel(draftRole)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {roleLabel(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        className="min-h-11 sm:min-h-9"
                        disabled={
                          busy ||
                          !draftRole ||
                          draftRole === normalizeRole(account.role)
                        }
                        onClick={() =>
                          draftRole &&
                          void mutate(
                            () =>
                              adminClient.users[":id"].role.$put({
                                param: { id: account.id },
                                json: { role: draftRole },
                              }),
                            "Role berhasil diperbarui",
                            "Gagal memperbarui role pengguna.",
                          )
                        }
                      >
                        Simpan
                      </Button>
                    </div>
                  ) : (
                    roleLabel(account.role)
                  ),
                ],
                [
                  "Masa aktif",
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <ActiveUntilText day={account.active_until ?? null} />
                    {manageable ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11 sm:min-h-8"
                        aria-label={`Ubah masa aktif ${name}`}
                        disabled={busy}
                        onClick={() => setEditingUntil(true)}
                      >
                        Ubah
                      </Button>
                    ) : null}
                  </div>,
                ],
                ["Terdaftar", formatDate(account.created_at)],
                ["Terakhir masuk", formatDateTime(account.last_sign_in_at)],
              ]}
            />
          </Panel>

          <Panel
            title="Peserta KTP"
            action={
              manageable ? (
                peserta ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      onClick={() => setLinking(true)}
                    >
                      Ganti
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      disabled={busy}
                      onClick={() => setConfirmKind("unlink")}
                    >
                      Lepas tautan
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 sm:min-h-8"
                    onClick={() => setLinking(true)}
                  >
                    Tautkan peserta
                  </Button>
                )
              ) : null
            }
          >
            {peserta ? (
              <>
                <Rows
                  rows={[
                    [
                      "Nama",
                      peserta.batch_name ? (
                        <Link
                          to="/profiler"
                          search={{
                            batch: peserta.batch_name,
                            participant: peserta.id,
                          }}
                          className="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
                        >
                          {peserta.nama}
                        </Link>
                      ) : (
                        peserta.nama
                      ),
                    ],
                    ["Folder", peserta.batch_name ?? "-"],
                    ["Tim", peserta.tim ?? "-"],
                    ["Jabatan", peserta.jabatan ?? "-"],
                    ["NIK OJK", peserta.nik_ojk ?? "-"],
                  ]}
                />
                <p className="py-2.5 text-xs text-muted-foreground">
                  Dipakai untuk dashboard SIDAK milik {name} dan cakupan leader
                  timnya.
                </p>
              </>
            ) : (
              <p className="py-3 text-sm text-muted-foreground">
                Belum tertaut. Tautkan kalau akun ini milik seorang peserta,
                supaya ia bisa melihat data SIDAK miliknya sendiri.
              </p>
            )}
          </Panel>

          {canManageLimits ? (
            <Panel title="Batas latihan">
              <UserPracticeLimits
                account={{ id: account.id, name, role: account.role }}
                limits={practice_limits}
                editable={
                  !isSelf &&
                  ["agent", "leader"].includes(
                    normalizeRole(account.role) ?? "",
                  )
                }
                onSaved={() => void refetch()}
              />
            </Panel>
          ) : null}

          <Panel title="Penugasan KETIK">
            <Rows
              rows={
                ketik_assignment
                  ? [
                      ["Status", "Sudah ditugaskan"],
                      [
                        "Oleh",
                        `${ketik_assignment.assigned_by_name ?? "-"} · ${formatDate(ketik_assignment.assigned_at)}`,
                      ],
                    ]
                  : [["Status", "Belum ditugaskan"]]
              }
            />
          </Panel>

          {normalizeRole(account.role) === "leader" ? (
            <Panel
              title="Akses leader"
              action={
                <Link
                  to="/dashboard/access-approval"
                  className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-8"
                >
                  Atur di Persetujuan Akses
                </Link>
              }
            >
              <Rows
                rows={
                  leader_access.length
                    ? leader_access.map((access) => [
                        MODULE_LABEL[access.module] ?? access.module,
                        `Disetujui ${formatDate(access.approved_at ?? undefined)}${access.group_names.length ? ` · grup ${access.group_names.join(", ")}` : ""}`,
                      ])
                    : [["Status", "Belum ada akses yang disetujui"]]
                }
              />
            </Panel>
          ) : null}

          {manageable && canManageAdmins ? (
            <section
              aria-label="Hapus akun"
              className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Hapus akun
                </h2>
                <p className="text-xs text-muted-foreground">
                  Pengguna yang dihapus tidak bisa masuk lagi.
                </p>
              </div>
              <Button
                variant="destructive"
                className="min-h-11 w-fit sm:min-h-9"
                disabled={busy}
                onClick={() => setConfirmKind("delete")}
              >
                Hapus pengguna
              </Button>
            </section>
          ) : null}
        </div>

        <Panel
          title="Riwayat perubahan"
          action={
            <Link
              to="/dashboard/activities"
              className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-8"
            >
              Lihat di Log Aktivitas
            </Link>
          }
        >
          {history.length ? (
            <ol>
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="grid gap-1 border-b border-border py-2.5 text-sm last:border-b-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4"
                >
                  <span className="text-muted-foreground tabular-nums">
                    {formatDateTime(entry.created_at)}
                  </span>
                  <span className="text-foreground">
                    {entry.action}
                    {entry.actor_name ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {entry.actor_name}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-3 text-sm text-muted-foreground">
              Belum ada perubahan yang tercatat untuk akun ini.
            </p>
          )}
        </Panel>
      </div>

      {linking ? (
        <LinkPesertaDialog
          account={{ id: account.id, name, email: account.email }}
          currentPesertaId={peserta?.id ?? null}
          saving={busy}
          onClose={() => setLinking(false)}
          onLink={async (pesertaId) => {
            const ok = await mutate(
              () =>
                adminClient.users[":id"].peserta.$put({
                  param: { id: account.id },
                  json: { peserta_id: pesertaId },
                }),
              "Akun ditautkan ke peserta",
              "Gagal menautkan peserta.",
            );
            if (ok) setLinking(false);
          }}
        />
      ) : null}

      {editingUntil ? (
        <ActiveUntilDialog
          title={`Masa aktif ${name}`}
          current={account.active_until ?? null}
          onClose={() => setEditingUntil(false)}
          onSave={(day) =>
            mutate(
              () =>
                adminClient.users[":id"]["active-until"].$put({
                  param: { id: account.id },
                  json: { active_until: day },
                }),
              day
                ? `Masa aktif ${name} sampai ${formatWibDay(day)}`
                : `Masa aktif ${name} tanpa batas waktu`,
              "Masa aktif belum tersimpan.",
            )
          }
        />
      ) : null}

      {approving ? (
        <ApproveDialog
          user={account}
          canGrantAdmin={canManageAdmins}
          onClose={() => setApproving(false)}
          onDone={() => {
            setApproving(false);
            void refetch();
          }}
        />
      ) : null}

      {copy && confirmKind ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmKind(null);
          }}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.label}
          tone={copy.danger ? "destructive" : "default"}
          pending={busy}
          onConfirm={async () => {
            if (await confirmActions[confirmKind]()) setConfirmKind(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** "Sampai 31 Des 2026 · 74 hari lagi"; amber when 7 days or fewer remain. */
function ActiveUntilText({ day }: { day: string | null }) {
  if (!day) return <span>Tanpa batas waktu</span>;
  if (isAccountExpired(day))
    return (
      <span>
        Berakhir <b className="font-medium">{formatWibDay(day)}</b>
        <span className="text-chart-amber"> · masa aktif habis</span>
      </span>
    );
  const left = daysLeft(day);
  return (
    <span>
      Sampai <b className="font-medium">{formatWibDay(day)}</b>
      <span
        className={left <= 7 ? "text-chart-amber" : "text-muted-foreground"}
      >
        {" "}
        · {left === 0 ? "hari terakhir" : `${left} hari lagi`}
      </span>
    </span>
  );
}

function BackLink() {
  return (
    <Link
      to="/dashboard/users"
      className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      Kembali ke Pengguna
    </Link>
  );
}
