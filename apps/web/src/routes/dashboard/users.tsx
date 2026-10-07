import { ROLES, can, normalizeRole, type Role } from "@trainers/types";
import type { ManagedUser } from "@trainers/types";
import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { useApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import { Pagination } from "../../components/ui/Pagination";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { ManagementShell } from "./components/management/ManagementShell";
import { SearchField } from "./components/management/SearchField";
import { SegmentedFilter } from "./components/management/SegmentedFilter";
import { StatusDot, type StatusTone } from "./components/management/StatusDot";
import { SidePanel } from "./components/management/SidePanel";
import { ConfirmDialog } from "./components/management/ConfirmDialog";
import { EmptyState } from "./components/management/EmptyState";

type UserStatus = "approved" | "pending" | "rejected";
type StatusFilter = "all" | "pending" | "active" | "inactive";
type NormalizedStatus = Exclude<StatusFilter, "all">;
type ConfirmKind = "reject" | "suspend" | "reset" | "delete";

const STATUS_PRESENTATION: Record<
  NormalizedStatus,
  { label: string; tone: StatusTone }
> = {
  pending: { label: "Menunggu", tone: "warning" },
  active: { label: "Aktif", tone: "success" },
  inactive: { label: "Nonaktif", tone: "muted" },
};

const CONFIRM_COPY: Record<
  ConfirmKind,
  {
    title: string;
    description: string;
    confirmLabel: string;
    destructive: boolean;
  }
> = {
  reject: {
    title: "Tolak pendaftaran?",
    description:
      "Akun menjadi nonaktif dan tidak bisa masuk sampai dipulihkan.",
    confirmLabel: "Tolak",
    destructive: true,
  },
  suspend: {
    title: "Tangguhkan pengguna?",
    description:
      "Akun kembali ke antrean Menunggu dan tidak bisa masuk sampai disetujui lagi.",
    confirmLabel: "Tangguhkan",
    destructive: true,
  },
  reset: {
    title: "Kirim link reset password?",
    description: "Link reset dikirim ke email pengguna ini.",
    confirmLabel: "Kirim link",
    destructive: false,
  },
  delete: {
    title: "Hapus pengguna?",
    description:
      "Pengguna tidak akan bisa masuk lagi. Tindakan ini tidak bisa dibatalkan dari panel ini.",
    confirmLabel: "Hapus pengguna",
    destructive: true,
  },
};

function roleOptions(role: Role | null) {
  if (!can(role, "admin.users")) return [];
  return ROLES.filter(
    (target) => target !== "admin" || can(role, "admin.users.manageAdmin"),
  );
}

function roleLabel(role?: string | null) {
  const normalized = normalizeRole(role);
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "-";
}

function normalizeStatus(status?: string | null): NormalizedStatus {
  const value = status?.toLowerCase().trim() ?? "";
  if (value === "approved" || value === "active") return "active";
  if (value === "rejected" || value === "inactive") return "inactive";
  return "pending";
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function UsersPage() {
  const currentProfile = useAuthStore((s) => s.profile);
  const managerRole = normalizeRole(currentProfile?.role);
  const canManageAdmins = can(managerRole, "admin.users.manageAdmin");

  const { data, loading, refetch } = useApi<ManagedUser[]>("/admin/users");
  const users = data ?? [];

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<Role | "">("");
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  const selectedUser = users.find((entry) => entry.id === selectedUserId);

  useEffect(() => {
    setDraftRole(normalizeRole(selectedUser?.role) ?? "");
  }, [selectedUser?.id, selectedUser?.role]);

  const canManage = (entry: ManagedUser) =>
    entry.id !== currentProfile?.id &&
    (normalizeRole(entry.role) !== "admin" || canManageAdmins);

  const runMutation = async (
    userId: string,
    action: () => Promise<Parameters<typeof unwrapResponse>[0]>,
    successMessage: string | null,
    errorMessage: string,
  ) => {
    setUpdating(userId);
    try {
      await unwrapResponse(await action());
      if (successMessage) notify.success(successMessage);
      await refetch();
      return true;
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, errorMessage));
      return false;
    } finally {
      setUpdating(null);
    }
  };

  const updateStatus = (userId: string, status: UserStatus, message: string) =>
    runMutation(
      userId,
      () =>
        adminClient.users[":id"].status.$put({
          param: { id: userId },
          json: { status },
        }),
      message,
      "Gagal memperbarui status pengguna.",
    );

  const saveRole = (userId: string, role: Role) =>
    runMutation(
      userId,
      () =>
        adminClient.users[":id"].role.$put({
          param: { id: userId },
          json: { role },
        }),
      "Role berhasil diperbarui",
      "Gagal memperbarui role pengguna.",
    );

  const runConfirmed = (kind: ConfirmKind, user: ManagedUser) => {
    switch (kind) {
      case "reject":
        return updateStatus(user.id, "rejected", "Pendaftaran ditolak");
      case "suspend":
        return updateStatus(user.id, "pending", "Pengguna ditangguhkan");
      case "reset":
        return runMutation(
          user.id,
          () =>
            adminClient.users[":id"]["reset-password"].$post({
              param: { id: user.id },
              json: { email: user.email },
            }),
          `Link reset password dikirim ke ${user.email}`,
          "Gagal mengirim link reset password.",
        );
      case "delete":
        return runMutation(
          user.id,
          () => adminClient.users[":id"].$delete({ param: { id: user.id } }),
          "Pengguna berhasil dihapus",
          "Gagal menghapus pengguna.",
        );
    }
  };

  const handleConfirm = async () => {
    if (!selectedUser || !confirmKind) return;
    if (!(await runConfirmed(confirmKind, selectedUser))) return;
    if (confirmKind === "delete") setSelectedUserId(null);
    setConfirmKind(null);
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredUsers = users.filter((entry) => {
    const matchesSearch =
      !normalizedSearch ||
      entry.email?.toLowerCase().includes(normalizedSearch) ||
      entry.full_name?.toLowerCase().includes(normalizedSearch);
    return (
      matchesSearch &&
      (statusFilter === "all" || normalizeStatus(entry.status) === statusFilter)
    );
  });
  const paginatedUsers = filteredUsers.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const countBy = (status: NormalizedStatus) =>
    users.filter((entry) => normalizeStatus(entry.status) === status).length;

  const selectedStatus = selectedUser
    ? normalizeStatus(selectedUser.status)
    : null;
  const busy = selectedUser ? updating === selectedUser.id : false;
  const confirmCopy = confirmKind ? CONFIRM_COPY[confirmKind] : null;

  return (
    <ManagementShell
      title="Pengguna"
      description="Setujui pendaftaran, atur role, dan kelola status akun pengguna."
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchField
          label="Cari nama atau email pengguna"
          value={searchTerm}
          onChange={setSearchTerm}
          className="lg:w-96"
        />
        <SegmentedFilter
          label="Filter status pengguna"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: "all", label: "Semua", count: users.length },
            { id: "pending", label: "Menunggu", count: countBy("pending") },
            { id: "active", label: "Aktif", count: countBy("active") },
            { id: "inactive", label: "Nonaktif", count: countBy("inactive") },
          ]}
        />
      </div>

      <section
        aria-label="Daftar pengguna"
        className="overflow-hidden rounded-xl border border-border bg-card"
      >
        {loading && users.length === 0 ? (
          <div role="status" aria-live="polite" className="grid gap-3 p-4">
            <span className="sr-only">Memuat data pengguna…</span>
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            title="Tidak ada pengguna ditemukan"
            description="Coba ubah kata kunci atau filter status."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 text-xs text-muted-foreground">
                    Pengguna
                  </TableHead>
                  <TableHead className="hidden px-4 text-xs text-muted-foreground sm:table-cell">
                    Role
                  </TableHead>
                  <TableHead className="hidden px-4 text-xs text-muted-foreground md:table-cell">
                    Status
                  </TableHead>
                  <TableHead className="hidden px-4 text-xs text-muted-foreground lg:table-cell">
                    Terdaftar
                  </TableHead>
                  <TableHead className="px-4 text-right text-xs text-muted-foreground">
                    <span className="sr-only">Aksi</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.map((entry) => {
                  const status =
                    STATUS_PRESENTATION[normalizeStatus(entry.status)];
                  const isSelf = entry.id === currentProfile?.id;
                  const isPending = normalizeStatus(entry.status) === "pending";
                  const manageable = canManage(entry);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="max-w-0 px-4 py-3 whitespace-normal">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-foreground">
                            {entry.full_name || "Tanpa nama"}
                            {isSelf ? (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                (Anda)
                              </span>
                            ) : null}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {entry.email}
                          </span>
                          <span className="mt-1 flex items-center gap-3 md:hidden">
                            <StatusDot
                              tone={status.tone}
                              label={status.label}
                            />
                            <span className="text-xs text-muted-foreground sm:hidden">
                              {roleLabel(entry.role)}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 text-sm sm:table-cell">
                        {roleLabel(entry.role)}
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 md:table-cell">
                        <StatusDot tone={status.tone} label={status.label} />
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 text-sm text-muted-foreground tabular-nums lg:table-cell">
                        {formatDate(entry.created_at)}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {manageable && isPending ? (
                            <Button
                              className="h-11 sm:h-8"
                              disabled={updating === entry.id}
                              onClick={() =>
                                updateStatus(
                                  entry.id,
                                  "approved",
                                  `${entry.full_name || entry.email} disetujui`,
                                )
                              }
                            >
                              Setujui
                            </Button>
                          ) : null}
                          {manageable ? (
                            <Button
                              variant="outline"
                              className="h-11 sm:h-8"
                              onClick={() => setSelectedUserId(entry.id)}
                            >
                              Kelola
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filteredUsers.length > pageSize ? (
              <div className="border-t border-border px-4 py-3">
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={filteredUsers.length}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                  showPageSizeSelector
                />
              </div>
            ) : null}
          </>
        )}
      </section>

      {selectedUser && selectedStatus ? (
        <SidePanel
          open
          onOpenChange={(open) => {
            if (!open) setSelectedUserId(null);
          }}
          title={selectedUser.full_name || "Tanpa nama"}
          description={selectedUser.email}
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <StatusDot
                  tone={STATUS_PRESENTATION[selectedStatus].tone}
                  label={STATUS_PRESENTATION[selectedStatus].label}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Terdaftar</dt>
              <dd className="mt-1 tabular-nums">
                {formatDate(selectedUser.created_at)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">ID</dt>
              <dd className="mt-1 font-mono text-xs break-all text-muted-foreground">
                {selectedUser.id}
              </dd>
            </div>
          </dl>

          <section className="grid gap-2 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-foreground">Role</h3>
            <div className="flex gap-2">
              <Select
                value={draftRole}
                onValueChange={(next) => {
                  if (next) setDraftRole(next as Role);
                }}
                disabled={busy}
              >
                <SelectTrigger
                  aria-label={`Role ${selectedUser.full_name || selectedUser.email}`}
                  className="h-11 flex-1 sm:h-9"
                >
                  <SelectValue>{roleLabel(draftRole)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roleOptions(managerRole).map((option) => (
                    <SelectItem key={option} value={option}>
                      {roleLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="h-11 sm:h-9"
                disabled={
                  busy ||
                  !draftRole ||
                  draftRole === normalizeRole(selectedUser.role)
                }
                onClick={() =>
                  draftRole && saveRole(selectedUser.id, draftRole)
                }
              >
                Simpan role
              </Button>
            </div>
          </section>

          <section className="grid gap-2 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-foreground">
              Status akun
            </h3>
            <div className="flex flex-wrap gap-2">
              {selectedStatus === "pending" ? (
                <>
                  <Button
                    className="h-11 sm:h-9"
                    disabled={busy}
                    onClick={() =>
                      updateStatus(
                        selectedUser.id,
                        "approved",
                        "Pengguna disetujui",
                      )
                    }
                  >
                    Setujui
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 sm:h-9"
                    disabled={busy}
                    onClick={() => setConfirmKind("reject")}
                  >
                    Tolak
                  </Button>
                </>
              ) : selectedStatus === "inactive" ? (
                <Button
                  variant="outline"
                  className="h-11 sm:h-9"
                  disabled={busy}
                  onClick={() =>
                    updateStatus(
                      selectedUser.id,
                      "pending",
                      "Pengguna dipulihkan ke antrean Menunggu",
                    )
                  }
                >
                  Pulihkan
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="h-11 sm:h-9"
                  disabled={busy}
                  onClick={() => setConfirmKind("suspend")}
                >
                  Tangguhkan
                </Button>
              )}
              {selectedStatus !== "pending" ? (
                <Button
                  variant="outline"
                  className="h-11 sm:h-9"
                  disabled={busy || !selectedUser.email}
                  onClick={() => setConfirmKind("reset")}
                >
                  Kirim reset password
                </Button>
              ) : null}
            </div>
          </section>

          {canManageAdmins ? (
            <section className="mt-auto grid gap-2 border-t border-border pt-5">
              <h3 className="text-sm font-semibold text-foreground">
                Hapus akun
              </h3>
              <p className="text-xs text-muted-foreground">
                Pengguna yang dihapus tidak bisa masuk lagi.
              </p>
              <Button
                variant="destructive"
                className="h-11 w-fit sm:h-9"
                disabled={busy}
                onClick={() => setConfirmKind("delete")}
              >
                Hapus pengguna
              </Button>
            </section>
          ) : null}
        </SidePanel>
      ) : null}

      {confirmCopy ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmKind(null);
          }}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          tone={confirmCopy.destructive ? "destructive" : "default"}
          pending={busy}
          onConfirm={handleConfirm}
        />
      ) : null}
    </ManagementShell>
  );
}
