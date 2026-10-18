import { BULK_USER_MAX, can, normalizeRole } from "@trainers/types";
import type { ManagedUser } from "@trainers/types";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useApi } from "../../hooks/useApi";
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
import { StatusDot } from "./components/management/StatusDot";
import { EmptyState } from "./components/management/EmptyState";
import { ApproveDialog } from "./components/users/ApproveDialog";
import { BulkUserActions } from "./components/users/BulkUserActions";
import { notify } from "../../lib/toast";
import { describeUserLimits } from "./components/users/practice-limit-format";
import {
  STATUS_PRESENTATION,
  displayStatus,
  formatDate,
  normalizeStatus,
  roleLabel,
  type DisplayStatus,
} from "./users-format";

type StatusFilter = "all" | DisplayStatus;

const TOO_MANY = `Paling banyak ${BULK_USER_MAX} orang dalam satu aksi.`;
type LinkFilter = "all" | "linked" | "unlinked";

const LINK_FILTER_LABEL: Record<LinkFilter, string> = {
  all: "Semua peserta KTP",
  linked: "Sudah tertaut",
  unlinked: "Belum tertaut",
};

function limitsLabel(entry: ManagedUser): string {
  const role = normalizeRole(entry.role);
  if (role === "admin" || role === "trainer") return "Tanpa batas";
  return describeUserLimits(entry) ?? "Bawaan peran";
}

export default function UsersPage() {
  const navigate = useNavigate();
  const currentProfile = useAuthStore((s) => s.profile);
  const canManageAdmins = can(
    normalizeRole(currentProfile?.role),
    "admin.users.manageAdmin",
  );
  const canManageLimits = can(
    normalizeRole(currentProfile?.role),
    "practice.limits.manage",
  );

  const { data, loading, refetch } = useApi<ManagedUser[]>("/admin/users");
  const users = data ?? [];

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [approving, setApproving] = useState<ManagedUser | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // A new filter or search clears the selection, so no hidden row stays picked.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [searchTerm, statusFilter, linkFilter]);

  const canManage = (entry: ManagedUser) =>
    entry.id !== currentProfile?.id &&
    (normalizeRole(entry.role) !== "admin" || canManageAdmins);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredUsers = users.filter((entry) => {
    const matchesSearch =
      !normalizedSearch ||
      entry.email?.toLowerCase().includes(normalizedSearch) ||
      entry.full_name?.toLowerCase().includes(normalizedSearch) ||
      entry.linked_peserta?.nama.toLowerCase().includes(normalizedSearch);
    const matchesLink =
      linkFilter === "all" ||
      (linkFilter === "linked") === Boolean(entry.linked_peserta);
    return (
      matchesSearch &&
      matchesLink &&
      (statusFilter === "all" || displayStatus(entry) === statusFilter)
    );
  });
  const paginatedUsers = filteredUsers.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const countBy = (status: DisplayStatus) =>
    users.filter((entry) => displayStatus(entry) === status).length;

  // Only accounts this manager may change can be checked.
  const pageSelectable = paginatedUsers.filter(canManage);
  const filteredSelectable = filteredUsers.filter(canManage);
  const pageChecked = pageSelectable.filter((entry) => selected.has(entry.id));
  const selectedUsers = users.filter((entry) => selected.has(entry.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size >= BULK_USER_MAX) return notify.error(TOO_MANY);
    else next.add(id);
    setSelected(next);
  };
  const togglePage = () => {
    const next = new Set(selected);
    if (pageChecked.length === pageSelectable.length)
      pageSelectable.forEach((entry) => next.delete(entry.id));
    else
      for (const entry of pageSelectable) {
        if (next.size >= BULK_USER_MAX) {
          notify.error(TOO_MANY);
          break;
        }
        next.add(entry.id);
      }
    setSelected(next);
  };
  const selectAllFiltered = () => {
    if (filteredSelectable.length > BULK_USER_MAX)
      notify.info(`${TOO_MANY} ${BULK_USER_MAX} orang pertama dipilih.`);
    setSelected(
      new Set(
        filteredSelectable.slice(0, BULK_USER_MAX).map((entry) => entry.id),
      ),
    );
  };

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
        <Select
          value={linkFilter}
          onValueChange={(next) => {
            if (next) setLinkFilter(next as LinkFilter);
          }}
        >
          <SelectTrigger
            aria-label="Filter peserta KTP"
            className="h-11 w-full sm:h-9 lg:w-48"
          >
            <SelectValue>{LINK_FILTER_LABEL[linkFilter]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LINK_FILTER_LABEL) as LinkFilter[]).map((option) => (
              <SelectItem key={option} value={option}>
                {LINK_FILTER_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SegmentedFilter
          label="Filter status pengguna"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: "all", label: "Semua", count: users.length },
            { id: "pending", label: "Menunggu", count: countBy("pending") },
            { id: "active", label: "Aktif", count: countBy("active") },
            { id: "inactive", label: "Nonaktif", count: countBy("inactive") },
            { id: "expired", label: "Habis", count: countBy("expired") },
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
                  <TableHead className="w-10 pr-0 pl-4">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua di halaman ini"
                      disabled={!pageSelectable.length}
                      checked={
                        pageSelectable.length > 0 &&
                        pageChecked.length === pageSelectable.length
                      }
                      ref={(element) => {
                        if (element)
                          element.indeterminate =
                            pageChecked.length > 0 &&
                            pageChecked.length < pageSelectable.length;
                      }}
                      onChange={togglePage}
                      className="size-4 accent-foreground"
                    />
                  </TableHead>
                  <TableHead className="px-4 text-xs text-muted-foreground">
                    Pengguna
                  </TableHead>
                  <TableHead className="hidden px-4 text-xs text-muted-foreground sm:table-cell">
                    Role
                  </TableHead>
                  <TableHead className="hidden px-4 text-xs text-muted-foreground lg:table-cell">
                    Peserta KTP
                  </TableHead>
                  <TableHead className="hidden px-4 text-xs text-muted-foreground xl:table-cell">
                    Batas latihan
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
                  const status = STATUS_PRESENTATION[displayStatus(entry)];
                  const isSelf = entry.id === currentProfile?.id;
                  const isPending = normalizeStatus(entry.status) === "pending";
                  const name = entry.full_name || "Tanpa nama";
                  const checked = selected.has(entry.id);
                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer"
                      data-state={checked ? "selected" : undefined}
                      onClick={() => openUser(entry.id)}
                    >
                      <TableCell
                        className="w-10 pr-0 pl-4"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {canManage(entry) ? (
                          <input
                            type="checkbox"
                            aria-label={`Pilih ${name}`}
                            checked={checked}
                            onChange={() => toggle(entry.id)}
                            className="size-4 accent-foreground"
                          />
                        ) : null}
                      </TableCell>
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
                      <TableCell className="hidden max-w-0 px-4 py-3 text-sm xl:table-cell">
                        <span
                          className={
                            entry.practice_overrides?.length
                              ? "block truncate text-foreground"
                              : "block truncate text-muted-foreground"
                          }
                        >
                          {limitsLabel(entry)}
                        </span>
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
                              onClick={(event) => {
                                event.stopPropagation();
                                setApproving(entry);
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
            {pageSelectable.length > 0 &&
            pageChecked.length === pageSelectable.length &&
            filteredSelectable.length > selected.size ? (
              <div className="border-t border-border px-4 py-2 text-sm">
                <Button
                  variant="link"
                  className="h-auto min-h-11 px-0 sm:min-h-8"
                  onClick={selectAllFiltered}
                >
                  Pilih semua {filteredSelectable.length} hasil filter
                </Button>
              </div>
            ) : null}
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

      <BulkUserActions
        selected={selectedUsers}
        canGrantAdmin={canManageAdmins}
        canManageLimits={canManageLimits}
        onClear={() => setSelected(new Set())}
        onDone={(failedIds) => {
          setSelected(new Set(failedIds));
          void refetch();
        }}
      />

      {approving ? (
        <ApproveDialog
          user={approving}
          canGrantAdmin={canManageAdmins}
          onClose={() => setApproving(null)}
          onDone={() => {
            setApproving(null);
            void refetch();
          }}
        />
      ) : null}
    </ManagementShell>
  );
}
