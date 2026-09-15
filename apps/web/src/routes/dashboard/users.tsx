import { useState, useEffect } from "react";
import { Search, Users, Trash2 } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import { Pagination } from "../../components/ui/Pagination";
import type { ManagedUser } from "@trainers/types";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";

type ManagerRole = "trainer" | "admin";
type UserStatus = "approved" | "pending" | "rejected";

const ROLE_OPTIONS: Record<ManagerRole, string[]> = {
  trainer: ["agent", "leader", "trainer"],
  admin: ["agent", "leader", "trainer", "admin"],
};

function normalizeRoleValue(role?: string | null) {
  const value = role?.toLowerCase().trim() ?? "";
  if (value === "trainers") return "trainer";
  if (value === "agents") return "agent";
  if (["agent", "leader", "trainer", "admin"].includes(value)) return value;
  return "agent";
}

function normalizeRoleLabel(role?: string | null) {
  if (!role) return "-";
  const val = role.toLowerCase().trim();
  if (val === "admin") return "Admin";
  if (val === "trainer" || val === "trainers") return "Trainer";
  if (val === "leader") return "Leader";
  if (val === "agent" || val === "agents") return "Agent";
  return role;
}

function normalizeStatusValue(status?: string | null) {
  const value = status?.toLowerCase().trim() ?? "";
  if (value === "approved") return "active";
  if (value === "rejected") return "inactive";
  if (["active", "pending", "inactive"].includes(value)) return value;
  return "pending";
}

function normalizeStatusLabel(status?: string | null) {
  const value = normalizeStatusValue(status);
  if (value === "active") return "Aktif";
  if (value === "inactive") return "Nonaktif";
  return "Pending";
}

export default function UsersPage() {
  const currentProfile = useAuthStore((s) => s.profile);
  const managerRole = (
    currentProfile?.role?.toLowerCase() === "admin" ? "admin" : "trainer"
  ) as ManagerRole;

  const {
    data: initialUsers,
    loading,
    refetch,
  } = useApi<ManagedUser[]>("/admin/users");
  const [searchTerm, setSearchTerm] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "all" | "pending" | "active" | "inactive"
  >("all");
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>(
    {},
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, activeTab]);

  useEffect(() => {
    if (initialUsers) {
      const roles: Record<string, string> = {};
      initialUsers.forEach((u) => {
        roles[u.id] = normalizeRoleValue(u.role);
      });
      setSelectedRoles(roles);
    }
  }, [initialUsers]);

  const updateUserStatus = async (userId: string, status: UserStatus) => {
    setUpdating(userId);
    try {
      await unwrapResponse(
        await adminClient.users[":id"]["status"].$put({
          param: { id: userId },
          json: { status },
        }),
      );
      await refetch();
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal memperbarui status pengguna."));
    } finally {
      setUpdating(null);
    }
  };

  const updateUserRole = async (userId: string) => {
    const nextRole = selectedRoles[userId];
    if (!nextRole) return;

    setUpdating(userId);
    try {
      await unwrapResponse(
        await adminClient.users[":id"].role.$put({
          param: { id: userId },
          json: { role: nextRole },
        }),
      );
      await refetch();
      notify.success("Role berhasil diperbarui");
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal memperbarui role pengguna."));
    } finally {
      setUpdating(null);
    }
  };

  const deleteUser = async (userId: string) => {
    if (
      !confirm(
        "Apakah Anda yakin ingin menghapus pengguna ini? Pengguna tidak akan bisa masuk lagi.",
      )
    )
      return;

    setUpdating(userId);
    try {
      await unwrapResponse(
        await adminClient.users[":id"].$delete({
          param: { id: userId },
        }),
      );
      await refetch();
      notify.success("User berhasil dihapus");
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal menghapus pengguna."));
    } finally {
      setUpdating(null);
    }
  };

  const resetUserPassword = async (
    userId: string,
    userEmail: string | null,
  ) => {
    if (!userEmail) {
      notify.error("Email pengguna tidak tersedia.");
      return;
    }

    if (!confirm(`Kirim link reset password ke ${userEmail}?`)) return;

    setUpdating(userId);
    try {
      await unwrapResponse(
        await adminClient.users[":id"]["reset-password"].$post({
          param: { id: userId },
          json: { email: userEmail },
        }),
      );
      setResetSuccess(userId);
      setTimeout(() => setResetSuccess(null), 3000);
    } catch (err: unknown) {
      notify.error(
        `Gagal mengirim reset password: ${getErrorMessage(err, "unknown error")}`,
      );
    } finally {
      setUpdating(null);
    }
  };

  const users = initialUsers || [];

  const filteredUsers = users.filter((entry) => {
    const matchesSearch =
      entry.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.full_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const normalizedStatus = normalizeStatusValue(entry.status);
    if (activeTab === "pending")
      return matchesSearch && normalizedStatus === "pending";
    if (activeTab === "active")
      return matchesSearch && normalizedStatus === "active";
    if (activeTab === "inactive")
      return matchesSearch && normalizedStatus === "inactive";
    return matchesSearch;
  });

  const paginatedUsers = filteredUsers.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const pendingCount = users.filter(
    (entry) => normalizeStatusValue(entry.status) === "pending",
  ).length;
  const activeCount = users.filter(
    (entry) => normalizeStatusValue(entry.status) === "active",
  ).length;
  const inactiveCount = users.filter(
    (entry) => normalizeStatusValue(entry.status) === "inactive",
  ).length;

  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Kelola Pengguna
          </h2>
          <p className="mt-1 text-muted-foreground">
            Approval, suspend, role access, dan reset password dalam satu panel
            aksi terpusat.
          </p>
        </div>
        <Card className="min-w-[240px] border-border bg-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Operator Aktif
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {currentProfile?.email || "System User"}
          </p>
          <Badge
            variant="outline"
            className="mt-2 h-7 w-fit text-xs font-medium"
          >
            Hak kelola: {normalizeRoleLabel(managerRole)}
          </Badge>
        </Card>
      </div>

      {/* Filters & Search */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            aria-label="Cari nama atau email pengguna"
            placeholder="Cari nama atau email pengguna..."
            className="min-h-11 w-full rounded-lg border-input bg-card pl-12 pr-4 py-3 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div
          role="group"
          aria-label="Filter status pengguna"
          className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-1"
        >
          {[
            { id: "all", label: "Semua", count: users.length },
            { id: "pending", label: "Menunggu", count: pendingCount },
            { id: "active", label: "Aktif", count: activeCount },
            { id: "inactive", label: "Nonaktif", count: inactiveCount },
          ].map((tab) => (
            <Button
              key={tab.id}
              type="button"
              variant={activeTab === tab.id ? "secondary" : "ghost"}
              aria-pressed={activeTab === tab.id}
              onClick={() =>
                setActiveTab(
                  tab.id as "all" | "pending" | "active" | "inactive",
                )
              }
              className="min-h-11 gap-2 rounded-lg px-4 py-2 text-xs font-semibold tracking-wide"
            >
              <span>{tab.label}</span>
              <Badge
                variant={activeTab === tab.id ? "default" : "outline"}
                className="h-6 px-1.5 text-[10px]"
              >
                {tab.count}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      {/* Users List */}
      <div className="space-y-4">
        {loading ? (
          <div
            className="flex flex-col items-center justify-center py-20 text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Skeleton className="size-10 rounded-full" />
            <span className="mt-4 text-sm font-medium">
              Memproses data pengguna...
            </span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <Card className="border-dashed border-border bg-card py-20 text-center">
            <Users
              aria-hidden="true"
              className="mx-auto size-12 text-muted-foreground"
            />
            <p className="mt-4 font-semibold text-foreground">
              Tidak ada pengguna ditemukan
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Coba sesuaikan kata kunci pencarian Anda.
            </p>
          </Card>
        ) : (
          <AnimatePresence>
            {paginatedUsers.map((entry) => {
              const normalizedEntryRole = normalizeRoleValue(entry.role);
              const normalizedEntryStatus = normalizeStatusValue(entry.status);
              const isPending = normalizedEntryStatus === "pending";
              const isInactive = normalizedEntryStatus === "inactive";
              const isSelf = entry.id === currentProfile?.id;
              const canDelete = managerRole === "admin" && !isSelf;
              const canChangeRole = !isSelf;
              const isRoleChanged =
                selectedRoles[entry.id] &&
                selectedRoles[entry.id] !== normalizedEntryRole;

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="mb-3"
                >
                  <Card className="flex flex-col justify-between gap-4 border-border bg-card p-4 xl:flex-row xl:items-center">
                    {/* User Info */}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {entry.full_name || "Tanpa Nama"}
                        </h3>
                        <Badge
                          variant="outline"
                          className="h-7 shrink-0 px-2 text-[10px] uppercase tracking-wider"
                        >
                          {normalizeStatusLabel(entry.status)}
                        </Badge>
                        {isSelf && (
                          <Badge
                            variant="outline"
                            className="h-7 shrink-0 border-foreground px-2 text-[10px] uppercase tracking-wider"
                          >
                            Anda
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {entry.email}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>ID: {entry.id.slice(0, 8)}</span>
                        <span>•</span>
                        <span>
                          Daftar:{" "}
                          {new Date(entry.created_at ?? "").toLocaleDateString(
                            "id-ID",
                          )}
                        </span>
                        <span>•</span>
                        <span>Role: {normalizeRoleLabel(entry.role)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
                      {/* Role Select */}
                      <div className="flex items-center gap-2">
                        <Select
                          value={selectedRoles[entry.id] || normalizedEntryRole}
                          onValueChange={(nextRole) => {
                            if (!nextRole) return;
                            setSelectedRoles((prev) => ({
                              ...prev,
                              [entry.id]: nextRole,
                            }));
                          }}
                          disabled={updating === entry.id || !canChangeRole}
                        >
                          <SelectTrigger
                            aria-label={`Role ${entry.full_name || entry.email || "pengguna"}`}
                            className="min-h-11 w-[7rem] rounded-lg border-input bg-background px-2 text-xs"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS[managerRole].map((option) => (
                              <SelectItem key={option} value={option}>
                                {normalizeRoleLabel(option)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isRoleChanged && (
                          <Button
                            type="button"
                            onClick={() => updateUserRole(entry.id)}
                            disabled={updating === entry.id || !canChangeRole}
                            className="min-h-11 px-3 text-xs font-medium"
                          >
                            Simpan
                          </Button>
                        )}
                      </div>

                      <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

                      {/* Action Buttons */}
                      {isPending ? (
                        <>
                          <Button
                            type="button"
                            onClick={() =>
                              updateUserStatus(entry.id, "approved")
                            }
                            disabled={updating === entry.id}
                            className="min-h-11 px-3 text-xs font-medium"
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              updateUserStatus(entry.id, "rejected")
                            }
                            disabled={updating === entry.id}
                            className="min-h-11 px-3 text-xs font-medium"
                          >
                            Tolak
                          </Button>
                        </>
                      ) : isInactive ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => updateUserStatus(entry.id, "pending")}
                          disabled={updating === entry.id}
                          className="min-h-11 px-3 text-xs font-medium"
                        >
                          Pulihkan
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => updateUserStatus(entry.id, "pending")}
                          disabled={updating === entry.id}
                          className="min-h-11 px-3 text-xs font-medium"
                        >
                          Suspend
                        </Button>
                      )}

                      {!isPending && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            resetUserPassword(entry.id, entry.email)
                          }
                          disabled={updating === entry.id}
                          className="min-h-11 px-3 text-xs font-medium"
                        >
                          {resetSuccess === entry.id ? "Terkirim" : "Reset Pwd"}
                        </Button>
                      )}

                      {canDelete && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => deleteUser(entry.id)}
                          disabled={updating === entry.id}
                          className="min-h-11 gap-1 px-3 text-xs font-medium"
                        >
                          <Trash2 aria-hidden="true" />
                          Hapus
                        </Button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {filteredUsers.length > 0 && (
          <Card className="border-border bg-card p-4">
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
          </Card>
        )}
      </div>
    </main>
  );
}
