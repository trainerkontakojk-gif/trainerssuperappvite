import { useState, useEffect } from "react";
import { Search, Users, Trash2 } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import { Pagination } from "../../components/ui/Pagination";
import type { ManagedUser } from "@trainers/types";
import { motion, AnimatePresence } from "framer-motion";

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
    <div className="space-y-8 font-['Inter',sans-serif] px-4 sm:px-6 lg:px-8 py-8 max-w-[1400px] mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-['Outfit',sans-serif] font-bold tracking-tight text-[var(--fg)]">
            Kelola Pengguna
          </h2>
          <p className="mt-1 text-[var(--fg2)]">
            Approval, suspend, role access, dan reset password dalam satu panel
            aksi terpusat.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 min-w-[240px]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg3)]">
            Operator Aktif
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--fg)]">
            {currentProfile?.email || "System User"}
          </p>
          <p className="text-xs text-[var(--fg2)] font-medium mt-1 border border-[var(--border)] inline-block px-2 py-0.5 rounded">
            Hak kelola: {normalizeRoleLabel(managerRole)}
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg3)]" />
          <input
            type="text"
            placeholder="Cari nama atau email pengguna..."
            className="w-full bg-transparent border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg3)] focus:border-[var(--fg)] focus:outline-none rounded-[6px] pl-12 pr-4 py-3 text-sm transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
          {[
            { id: "all", label: "Semua", count: users.length },
            { id: "pending", label: "Menunggu", count: pendingCount },
            { id: "active", label: "Aktif", count: activeCount },
            { id: "inactive", label: "Nonaktif", count: inactiveCount },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(
                  tab.id as "all" | "pending" | "active" | "inactive",
                )
              }
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold tracking-wide transition-all ${
                activeTab === tab.id
                  ? "bg-[var(--fg)] text-[var(--bg)]"
                  : "text-[var(--fg2)] hover:bg-[var(--surface)]"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  activeTab === tab.id
                    ? "bg-[var(--bg)] text-[var(--fg)] opacity-80"
                    : "border border-[var(--border)] text-[var(--fg2)]"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Users List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--fg3)]">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--fg)] border-t-transparent" />
            <span className="mt-4 text-sm font-medium">
              Memproses data pengguna...
            </span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] py-20 text-center bg-[var(--surface)]">
            <Users className="mx-auto h-12 w-12 text-[var(--fg3)]" />
            <p className="mt-4 font-semibold text-[var(--fg)]">
              Tidak ada pengguna ditemukan
            </p>
            <p className="text-xs text-[var(--fg2)] mt-1">
              Coba sesuaikan kata kunci pencarian Anda.
            </p>
          </div>
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
                  className="flex flex-col xl:flex-row xl:items-center justify-between p-4 border border-[var(--border)] bg-[var(--surface)] rounded-[12px] gap-4 mb-3"
                >
                  {/* User Info */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--fg)] truncate">
                        {entry.full_name || "Tanpa Nama"}
                      </h3>
                      <span className="text-[10px] uppercase tracking-wider text-[var(--fg2)] border border-[var(--border)] rounded-full px-2 py-0.5 shrink-0">
                        {normalizeStatusLabel(entry.status)}
                      </span>
                      {isSelf && (
                        <span className="text-[10px] uppercase tracking-wider text-[var(--fg)] border border-[var(--fg)] rounded-full px-2 py-0.5 shrink-0">
                          Anda
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--fg2)] mt-1 truncate">
                      {entry.email}
                    </p>
                    <div className="text-[11px] text-[var(--fg3)] mt-2 flex flex-wrap gap-2 items-center">
                      <span>ID: {entry.id.slice(0, 8)}</span>
                      <span>•</span>
                      <span>
                        Daftar:{" "}
                        {new Date(entry.created_at ?? "").toLocaleDateString(
                          "id-ID",
                        )}
                      </span>
                      <span>•</span>
                      <span>
                        Role: {normalizeRoleLabel(entry.role)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 xl:justify-end shrink-0">
                    {/* Role Select */}
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedRoles[entry.id] || normalizedEntryRole}
                        onChange={(e) => {
                          const nextRole = e.target.value;
                          setSelectedRoles((prev) => ({
                            ...prev,
                            [entry.id]: nextRole,
                          }));
                        }}
                        disabled={updating === entry.id || !canChangeRole}
                        className="bg-transparent border border-[var(--border)] text-[var(--fg)] focus:border-[var(--fg)] focus:outline-none rounded-[6px] px-2 py-1.5 text-xs disabled:opacity-50"
                      >
                        {ROLE_OPTIONS[managerRole].map((opt) => (
                          <option key={opt} value={opt} className="bg-[var(--surface)]">
                            {normalizeRoleLabel(opt)}
                          </option>
                        ))}
                      </select>
                      {isRoleChanged && (
                        <button
                          onClick={() => updateUserRole(entry.id)}
                          disabled={updating === entry.id || !canChangeRole}
                          className="bg-[var(--inv-bg)] text-[var(--inv-fg)] rounded-[6px] px-3 py-1.5 text-xs font-medium transition-all hover:opacity-90 disabled:opacity-50"
                        >
                          Simpan
                        </button>
                      )}
                    </div>

                    <div className="w-px h-6 bg-[var(--border)] hidden sm:block mx-1" />

                    {/* Action Buttons */}
                    {isPending ? (
                      <>
                        <button
                          onClick={() => updateUserStatus(entry.id, "approved")}
                          disabled={updating === entry.id}
                          className="bg-[var(--inv-bg)] text-[var(--inv-fg)] rounded-[6px] px-3 py-1.5 text-xs font-medium transition-all hover:opacity-90 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => updateUserStatus(entry.id, "rejected")}
                          disabled={updating === entry.id}
                          className="bg-transparent border border-[var(--border)] text-[var(--fg)] rounded-[6px] px-3 py-1.5 text-xs font-medium transition-all hover:bg-[var(--surface)] disabled:opacity-50"
                        >
                          Tolak
                        </button>
                      </>
                    ) : isInactive ? (
                      <button
                        onClick={() => updateUserStatus(entry.id, "pending")}
                        disabled={updating === entry.id}
                        className="bg-transparent border border-[var(--border)] text-[var(--fg)] rounded-[6px] px-3 py-1.5 text-xs font-medium transition-all hover:bg-[var(--surface)] disabled:opacity-50"
                      >
                        Pulihkan
                      </button>
                    ) : (
                      <button
                        onClick={() => updateUserStatus(entry.id, "pending")}
                        disabled={updating === entry.id}
                        className="bg-transparent border border-[var(--border)] text-[var(--fg)] rounded-[6px] px-3 py-1.5 text-xs font-medium transition-all hover:bg-[var(--surface)] disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}

                    {!isPending && (
                      <button
                        onClick={() => resetUserPassword(entry.id, entry.email)}
                        disabled={updating === entry.id}
                        className="bg-transparent border border-[var(--border)] text-[var(--fg)] rounded-[6px] px-3 py-1.5 text-xs font-medium transition-all hover:bg-[var(--surface)] disabled:opacity-50"
                      >
                        {resetSuccess === entry.id ? "Terkirim" : "Reset Pwd"}
                      </button>
                    )}

                    {canDelete && (
                      <button
                        onClick={() => deleteUser(entry.id)}
                        disabled={updating === entry.id}
                        className="bg-transparent border border-[var(--border)] text-[var(--fg)] rounded-[6px] px-3 py-1.5 text-xs font-medium transition-all hover:bg-[var(--surface)] disabled:opacity-50 flex items-center gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Hapus
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {filteredUsers.length > 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
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
        )}
      </div>
    </div>
  );
}
