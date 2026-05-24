import { useState, useEffect } from "react";
import {
  ShieldCheck,
  UserPlus,
  XCircle,
  Search,
  Users,
  CheckCircle2,
  KeyRound,
  Settings2,
  Trash2,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useApi, putApi, postApi, deleteApi } from "../../hooks/useApi";
import { notify } from "../../lib/toast";
import { Pagination } from "../../components/ui/Pagination";
import type { ManagedUser } from "@trainers/types";

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
      // Map 'approved' to backend status or pass directly (Hono service maps approved to active/approved)
      await putApi(`/admin/users/${userId}/status`, { status });
      await refetch();
    } catch (err: any) {
      notify.error(err.message || "Gagal memperbarui status pengguna.");
    } finally {
      setUpdating(null);
    }
  };

  const updateUserRole = async (userId: string) => {
    const nextRole = selectedRoles[userId];
    if (!nextRole) return;

    setUpdating(userId);
    try {
      await putApi(`/admin/users/${userId}/role`, { role: nextRole });
      await refetch();
      notify.success("Role berhasil diperbarui");
    } catch (err: any) {
      notify.error(err.message || "Gagal memperbarui role pengguna.");
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
      await deleteApi(`/admin/users/${userId}`);
      await refetch();
      notify.success("User berhasil dihapus");
    } catch (err: any) {
      notify.error(err.message || "Gagal menghapus pengguna.");
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
      await postApi(`/admin/users/${userId}/reset-password`, { email: userEmail });
      setResetSuccess(userId);
      setTimeout(() => setResetSuccess(null), 3000);
    } catch (err: any) {
      notify.error(
        `Gagal mengirim reset password: ${err.message || "unknown error"}`,
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
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Users className="h-3.5 w-3.5" />
            Access Control
          </div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Kelola Pengguna
          </h2>
          <p className="mt-1 text-gray-500">
            Approval, suspend, role access, dan reset password dalam satu panel
            aksi terpusat.
          </p>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm min-w-[240px]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Operator Aktif
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {currentProfile?.email || "System User"}
          </p>
          <p className="text-xs text-indigo-600 font-medium">
            Hak kelola: {normalizeRoleLabel(managerRole)}
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama atau email pengguna..."
            className="w-full rounded-xl border border-gray-200 bg-white pl-12 pr-4 py-3 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border bg-white p-1 shadow-sm">
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
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${activeTab === tab.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}
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
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <span className="mt-4 text-sm font-medium">
              Memproses data pengguna...
            </span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-20 text-center bg-white shadow-sm">
            <Users className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-4 font-semibold text-gray-900">
              Tidak ada pengguna ditemukan
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Coba sesuaikan kata kunci pencarian Anda.
            </p>
          </div>
        ) : (
          <>
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
                <div
                  key={entry.id}
                  className="grid gap-6 rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow xl:grid-cols-[1fr_360px]"
                >
                  {/* Details Section */}
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div
                        className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                          isPending
                            ? "bg-amber-50 text-amber-600"
                            : isInactive
                              ? "bg-red-50 text-red-600"
                              : "bg-emerald-50 text-emerald-600"
                        }`}
                      >
                        {isPending ? (
                          <UserPlus className="h-5 w-5" />
                        ) : isInactive ? (
                          <XCircle className="h-5 w-5" />
                        ) : (
                          <ShieldCheck className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-gray-900">
                            {entry.full_name || "Tanpa Nama"}
                          </h3>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isPending
                                ? "bg-amber-100 text-amber-800"
                                : isInactive
                                  ? "bg-red-100 text-red-800"
                                  : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {normalizeStatusLabel(entry.status)}
                          </span>
                          {isSelf && (
                            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                              Anda
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-500 break-all">
                          {entry.email}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                          <span>ID: {entry.id.slice(0, 8)}...</span>
                          <span>•</span>
                          <span>
                            Daftar:{" "}
                            {new Date(entry.created_at ?? "").toLocaleDateString(
                              "id-ID",
                            )}
                          </span>
                          <span>•</span>
                          <span>
                            Role:{" "}
                            <strong className="text-gray-600">
                              {normalizeRoleLabel(entry.role)}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Description Cards */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border p-4 bg-gray-50/50">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wide">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          Status Approval
                        </div>
                        <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                          {isPending
                            ? "Setujui pendaftaran user baru agar dapat login."
                            : isInactive
                              ? "Pulihkan user yang dinonaktifkan agar direview kembali."
                              : "Nonaktifkan user kembali ke pending jika diperlukan."}
                        </p>
                      </div>
                      <div className="rounded-xl border p-4 bg-gray-50/50">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wide">
                          <KeyRound className="h-4 w-4 text-indigo-500" />
                          Reset Password
                        </div>
                        <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                          Kirim link reset password langsung ke email terdaftar
                          pengguna.
                        </p>
                      </div>
                      <div className="rounded-xl border p-4 bg-gray-50/50">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wide">
                          <Settings2 className="h-4 w-4 text-slate-500" />
                          Lifecycle
                        </div>
                        <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                          Atur wewenang role, status aktif, atau hapus permanen
                          akun.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Control Panel Section */}
                  <div className="rounded-xl border bg-gray-50/50 p-5 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          Pengaturan Akses
                        </p>
                        <h4 className="mt-1 text-sm font-bold text-gray-800">
                          Ubah Role & lifecycle
                        </h4>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                            Role Akses
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={
                                selectedRoles[entry.id] || normalizedEntryRole
                              }
                              onChange={(e) => {
                                const nextRole = e.target.value;
                                setSelectedRoles((prev) => ({
                                  ...prev,
                                  [entry.id]: nextRole,
                                }));
                              }}
                              disabled={updating === entry.id || !canChangeRole}
                              className="flex-1 rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                            >
                              {ROLE_OPTIONS[managerRole].map((opt) => (
                                <option key={opt} value={opt}>
                                  {normalizeRoleLabel(opt)}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => updateUserRole(entry.id)}
                              disabled={
                                updating === entry.id ||
                                !isRoleChanged ||
                                !canChangeRole
                              }
                              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                              Simpan
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {isPending ? (
                            <>
                              <button
                                onClick={() =>
                                  updateUserStatus(entry.id, "approved")
                                }
                                disabled={updating === entry.id}
                                className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Approve
                              </button>
                              <button
                                onClick={() =>
                                  updateUserStatus(entry.id, "rejected")
                                }
                                disabled={updating === entry.id}
                                className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Tolak
                              </button>
                            </>
                          ) : isInactive ? (
                            <button
                              onClick={() =>
                                updateUserStatus(entry.id, "pending")
                              }
                              disabled={updating === entry.id}
                              className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              Pulihkan Status
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                updateUserStatus(entry.id, "pending")
                              }
                              disabled={updating === entry.id}
                              className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Suspend
                            </button>
                          )}

                          {!isPending && (
                            <button
                              onClick={() =>
                                resetUserPassword(entry.id, entry.email)
                              }
                              disabled={updating === entry.id}
                              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                                resetSuccess === entry.id
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                              }`}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              {resetSuccess === entry.id
                                ? "Terkirim"
                                : "Reset Pwd"}
                            </button>
                          )}

                          {canDelete && (
                            <button
                              onClick={() => deleteUser(entry.id)}
                              disabled={updating === entry.id}
                              className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Hapus Akun
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
                      {managerRole === "admin"
                        ? "Admin memiliki akses penuh untuk menghapus akun dan mengatur role sampai level Admin."
                        : "Trainer dapat approve/tolak user, reset password, suspend user, dan mengubah role sampai level Trainer."}
                    </p>
                  </div>
                </div>
              );
            })}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
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
          </>
        )}
      </div>
    </div>
  );
}
