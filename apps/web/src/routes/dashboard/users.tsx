import { can, normalizeRole } from "@trainers/types";
import type { ManagedUser } from "@trainers/types";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import { Pagination } from "../../components/ui/Pagination";
import { Button } from "../../components/ui/button";
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
import { StatusDot } from "./components/management/StatusDot";
import { EmptyState } from "./components/management/EmptyState";
import {
  STATUS_PRESENTATION,
  formatDate,
  normalizeStatus,
  roleLabel,
  type NormalizedStatus,
} from "./users-format";

type StatusFilter = "all" | NormalizedStatus;

export default function UsersPage() {
  const navigate = useNavigate();
  const currentProfile = useAuthStore((s) => s.profile);
  const canManageAdmins = can(
    normalizeRole(currentProfile?.role),
    "admin.users.manageAdmin",
  );

  const { data, loading, refetch } = useApi<ManagedUser[]>("/admin/users");
  const users = data ?? [];

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  const canManage = (entry: ManagedUser) =>
    entry.id !== currentProfile?.id &&
    (normalizeRole(entry.role) !== "admin" || canManageAdmins);

  const approve = async (entry: ManagedUser) => {
    setApproving(entry.id);
    try {
      await unwrapResponse(
        await adminClient.users[":id"].status.$put({
          param: { id: entry.id },
          json: { status: "approved" },
        }),
      );
      notify.success(`${entry.full_name || entry.email} disetujui`);
      await refetch();
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal memperbarui status pengguna."));
    } finally {
      setApproving(null);
    }
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredUsers = users.filter((entry) => {
    const matchesSearch =
      !normalizedSearch ||
      entry.email?.toLowerCase().includes(normalizedSearch) ||
      entry.full_name?.toLowerCase().includes(normalizedSearch) ||
      entry.linked_peserta?.nama.toLowerCase().includes(normalizedSearch);
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

  const openUser = (id: string) =>
    void navigate({ to: "/dashboard/users/$id", params: { id } });

  return (
    <ManagementShell
      title="Pengguna"
      description="Setujui pendaftaran, tautkan ke peserta KTP, dan atur role serta status akun."
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchField
          label="Cari nama, email, atau nama peserta"
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
                  <TableHead className="hidden px-4 text-xs text-muted-foreground lg:table-cell">
                    Peserta KTP
                  </TableHead>
                  <TableHead className="hidden px-4 text-xs text-muted-foreground md:table-cell">
                    Status
                  </TableHead>
                  <TableHead className="hidden px-4 text-xs text-muted-foreground xl:table-cell">
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
                  const name = entry.full_name || "Tanpa nama";
                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer"
                      onClick={() => openUser(entry.id)}
                    >
                      <TableCell className="max-w-0 px-4 py-3 whitespace-normal">
                        <div className="flex min-w-0 flex-col">
                          <Link
                            to="/dashboard/users/$id"
                            params={{ id: entry.id }}
                            onClick={(event) => event.stopPropagation()}
                            className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
                          >
                            {name}
                            {isSelf ? (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                (Anda)
                              </span>
                            ) : null}
                          </Link>
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
                      <TableCell className="hidden max-w-0 px-4 py-3 text-sm lg:table-cell">
                        {entry.linked_peserta ? (
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-foreground">
                              {entry.linked_peserta.nama}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {[
                                entry.linked_peserta.batch_name,
                                entry.linked_peserta.tim,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            Belum tertaut
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 md:table-cell">
                        <StatusDot tone={status.tone} label={status.label} />
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 text-sm text-muted-foreground tabular-nums xl:table-cell">
                        {formatDate(entry.created_at)}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {canManage(entry) && isPending ? (
                            <Button
                              className="h-11 sm:h-8"
                              disabled={approving === entry.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void approve(entry);
                              }}
                            >
                              Setujui
                            </Button>
                          ) : (
                            <ChevronRight
                              aria-hidden="true"
                              className="size-4 text-muted-foreground"
                            />
                          )}
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
    </ManagementShell>
  );
}
