import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  History,
  Search,
  ArrowDownToLine,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import { Pagination } from "../../components/ui/Pagination";
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
import type { ActivityLog } from "@trainers/types";

export default function ActivitiesPage() {
  const {
    data: logs,
    loading,
    refetch,
  } = useApi<ActivityLog[]>("/admin/activity-logs");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedActionType, setSelectedActionType] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedActionType]);

  const [deleting, setDeleting] = useState<string | null>(null);

  const filteredLogs = (logs || []).filter((log) => {
    const matchesSearch =
      (log.user_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.action || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.type || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.module || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction =
      selectedActionType === "ALL" ||
      (log.type || log.action) === selectedActionType;

    return matchesSearch && matchesAction;
  });

  const paginatedLogs = filteredLogs.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const renderActionBadge = (action: string) => {
    const act = action.toUpperCase();
    let color = "var(--muted-foreground)";
    if (act.includes("APPROVE") || act.includes("CREATE"))
      color = "var(--chart-green)";
    if (
      act.includes("REJECT") ||
      act.includes("REVOKE") ||
      act.includes("DELETE")
    )
      color = "var(--chart-red)";
    if (act.includes("UPDATE") || act.includes("REASSIGN"))
      color = "var(--chart-blue)";

    return (
      <Badge
        variant="outline"
        className="h-7 border-border bg-muted px-2.5 text-[9px] font-bold uppercase tracking-widest"
        style={{ color }}
      >
        {action}
      </Badge>
    );
  };

  const handleDelete = async (logId: string) => {
    if (!confirm("Hapus log aktivitas ini?")) return;
    setDeleting(logId);
    try {
      await unwrapResponse(
        await adminClient["activity-logs"][":id"].$delete({
          param: { id: logId },
        }),
      );
      notify.success("Log berhasil dihapus");
      refetch();
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal menghapus log"));
    } finally {
      setDeleting(null);
    }
  };

  const exportLogsToCsv = () => {
    if (filteredLogs.length === 0) return;

    const headers = ["Waktu", "Aktor", "Aksi", "Tipe", "Modul"];
    const rows = filteredLogs.map((log) => [
      new Date(log.created_at).toLocaleString("id-ID"),
      log.user_name || "-",
      log.action,
      log.type || "-",
      log.module || "-",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [
        headers.join(","),
        ...rows.map((e) => e.map((val) => `"${val}"`).join(",")),
      ].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    // eslint-disable-next-line react-hooks/purity
    link.setAttribute("download", `audit_trail_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Distinct action types for filter
  const actionTypes = Array.from(
    new Set((logs || []).map((l) => l.type || l.action)),
  ).filter((type): type is string => Boolean(type));

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="p-4 lg:p-8 max-w-[var(--content-max-width)] mx-auto space-y-8"
    >
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <Badge
            variant="outline"
            className="h-7 w-fit gap-2 border-border bg-muted px-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground"
          >
            <History aria-hidden="true" className="size-3" />
            Audit Trail
          </Badge>
          <h2 className="text-4xl font-bold tracking-tight text-foreground font-outfit">
            Log Aktivitas
          </h2>
          <p className="text-sm text-muted-foreground font-medium max-w-2xl leading-relaxed">
            Rekaman jejak audit dari seluruh mutasi akses, approval, dan
            perubahan status pengguna dalam sistem secara realtime.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => refetch()}
            disabled={loading}
            className="min-h-11 gap-1.5 text-xs font-bold"
          >
            <RefreshCw
              aria-hidden="true"
              className={
                loading ? "animate-spin motion-reduce:animate-none" : ""
              }
            />
            Refresh
          </Button>

          <Button
            type="button"
            onClick={exportLogsToCsv}
            disabled={filteredLogs.length === 0}
            className="min-h-11 gap-1.5 text-xs font-bold"
          >
            <ArrowDownToLine aria-hidden="true" />
            Ekspor CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            aria-label="Cari aktor, tipe aksi, atau modul"
            placeholder="Cari aktor, tipe aksi, atau modul..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="min-h-11 w-full rounded-xl border-input bg-card pl-12 pr-4 py-3 text-sm"
          />
        </div>

        <Select
          value={selectedActionType}
          onValueChange={(value) => {
            if (value) setSelectedActionType(value);
          }}
        >
          <SelectTrigger
            aria-label="Jenis aksi"
            className="min-h-11 w-full rounded-xl border-border bg-card px-4 py-3 text-sm font-semibold lg:w-60"
          >
            <SelectValue placeholder="Semua Jenis Aksi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Jenis Aksi</SelectItem>
            {actionTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Logs Table Card */}
      <Card className="overflow-hidden border-border bg-card p-0">
        {loading ? (
          <div
            className="flex flex-col items-center justify-center py-24 text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Skeleton className="size-10 rounded-full" />
            <span className="mt-4 text-xs font-bold uppercase tracking-widest">
              Memuat audit logs...
            </span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-24 text-center text-muted-foreground">
            <History
              aria-hidden="true"
              className="mx-auto mb-4 size-12 text-muted-foreground/20"
            />
            <h3 className="font-bold text-foreground">Belum ada aktivitas</h3>
            <p className="mt-1 text-xs font-medium">
              Belum ada rekaman mutasi yang terekam.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em]">
                    <th className="px-6 py-4">Waktu</th>
                    <th className="px-6 py-4">Aktor</th>
                    <th className="px-6 py-4">Aksi</th>
                    <th className="px-6 py-4 text-center">Tipe & Modul</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 text-xs text-foreground">
                  {paginatedLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-muted/10 transition-colors group"
                    >
                      <td className="px-6 py-5 whitespace-nowrap text-muted-foreground font-medium tabular-nums">
                        {new Date(log.created_at).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-6 py-5 font-bold text-foreground">
                        {log.user_name || "-"}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        {renderActionBadge(log.action)}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            {log.type || "-"}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-foreground/5 text-[9px] font-black uppercase border border-border/50 text-foreground/70">
                            {log.module || "-"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(log.id)}
                          disabled={deleting === log.id}
                          className="min-h-11 min-w-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Hapus log"
                          aria-label={`Hapus log ${log.action}`}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-muted/10 px-6 py-4">
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
          </>
        )}
      </Card>
    </motion.div>
  );
}
