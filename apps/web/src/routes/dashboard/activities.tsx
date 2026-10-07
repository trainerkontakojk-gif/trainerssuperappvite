import { Fragment, useEffect, useState } from "react";
import { ArrowDownToLine, RefreshCw } from "lucide-react";
import type { ActivityLog } from "@trainers/types";
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
import { StatusDot, type StatusTone } from "./components/management/StatusDot";
import { EmptyState } from "./components/management/EmptyState";

function actionTone(action: string): StatusTone {
  const value = action.toUpperCase();
  if (
    value.includes("REJECT") ||
    value.includes("REVOKE") ||
    value.includes("DELETE")
  )
    return "danger";
  if (value.includes("APPROVE") || value.includes("CREATE")) return "success";
  if (value.includes("UPDATE") || value.includes("REASSIGN")) return "warning";
  return "muted";
}

function dayKey(value: string) {
  return new Date(value).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Log aktivitas bersifat append-only: halaman ini hanya membaca dan mengekspor. */
export default function ActivitiesPage() {
  const {
    data: logs,
    loading,
    refetch,
  } = useApi<ActivityLog[]>("/admin/activity-logs");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedActionType, setSelectedActionType] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedActionType]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredLogs = (logs ?? []).filter((log) => {
    const matchesSearch = [
      log.user_name,
      log.action,
      log.type,
      log.module,
    ].some((field) => (field ?? "").toLowerCase().includes(normalizedSearch));
    const matchesAction =
      selectedActionType === "ALL" ||
      (log.type || log.action) === selectedActionType;
    return matchesSearch && matchesAction;
  });
  const paginatedLogs = filteredLogs.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const actionTypes = Array.from(
    new Set((logs ?? []).map((log) => log.type || log.action)),
  ).filter((type): type is string => Boolean(type));

  const exportLogsToCsv = () => {
    if (filteredLogs.length === 0) return;
    const rows = [
      ["Waktu", "Aktor", "Aksi", "Tipe", "Modul"],
      ...filteredLogs.map((log) => [
        new Date(log.created_at).toLocaleString("id-ID"),
        log.user_name || "-",
        log.action,
        log.type || "-",
        log.module || "-",
      ]),
    ];
    const blob = new Blob(
      [rows.map((row) => row.map(csvCell).join(",")).join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `log_aktivitas_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ManagementShell
      title="Log Aktivitas"
      description="Jejak audit perubahan akses, persetujuan, dan status pengguna. Log hanya bisa ditambah, tidak bisa diubah atau dihapus."
      actions={
        <>
          <Button
            variant="outline"
            className="h-11 sm:h-9"
            onClick={() => refetch()}
            disabled={loading}
          >
            <RefreshCw
              aria-hidden="true"
              className={
                loading ? "animate-spin motion-reduce:animate-none" : ""
              }
            />
            Muat ulang
          </Button>
          <Button
            className="h-11 sm:h-9"
            onClick={exportLogsToCsv}
            disabled={filteredLogs.length === 0}
          >
            <ArrowDownToLine aria-hidden="true" />
            Ekspor CSV
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <SearchField
          label="Cari aktor, tipe aksi, atau modul"
          value={searchTerm}
          onChange={setSearchTerm}
          className="md:w-96"
        />
        <Select
          value={selectedActionType}
          onValueChange={(value) => {
            if (value) setSelectedActionType(value);
          }}
        >
          <SelectTrigger
            aria-label="Jenis aksi"
            className="h-11 w-full bg-card md:w-60"
          >
            <SelectValue>
              {selectedActionType === "ALL"
                ? "Semua jenis aksi"
                : selectedActionType}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua jenis aksi</SelectItem>
            {actionTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <section
        aria-label="Daftar log aktivitas"
        className="overflow-hidden rounded-xl border border-border bg-card"
      >
        {loading && !logs ? (
          <div role="status" aria-live="polite" className="grid gap-3 p-4">
            <span className="sr-only">Memuat log aktivitas…</span>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            title="Belum ada aktivitas"
            description="Belum ada rekaman mutasi yang terekam."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-24 px-4 text-xs text-muted-foreground">
                    Waktu
                  </TableHead>
                  <TableHead className="px-4 text-xs text-muted-foreground">
                    Aktor
                  </TableHead>
                  <TableHead className="px-4 text-xs text-muted-foreground">
                    Aksi
                  </TableHead>
                  <TableHead className="hidden px-4 text-xs text-muted-foreground md:table-cell">
                    Modul
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLogs.map((log, index) => {
                  const day = dayKey(log.created_at);
                  const newDay =
                    index === 0 ||
                    dayKey(paginatedLogs[index - 1].created_at) !== day;
                  return (
                    <Fragment key={log.id}>
                      {newDay ? (
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead
                            colSpan={4}
                            scope="colgroup"
                            className="h-8 px-4 text-xs font-medium text-muted-foreground"
                          >
                            {day}
                          </TableHead>
                        </TableRow>
                      ) : null}
                      <TableRow>
                        <TableCell className="px-4 py-2.5 text-sm text-muted-foreground tabular-nums">
                          {new Date(log.created_at).toLocaleTimeString(
                            "id-ID",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-sm font-medium text-foreground">
                          {log.user_name || "-"}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <StatusDot
                            tone={actionTone(log.action)}
                            label={log.action}
                            className="font-mono"
                          />
                          {log.type ? (
                            <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
                              {log.type}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="hidden px-4 py-2.5 text-sm text-muted-foreground uppercase md:table-cell">
                          {log.module || "-"}
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {filteredLogs.length > pageSize ? (
              <div className="border-t border-border px-4 py-3">
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={filteredLogs.length}
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
