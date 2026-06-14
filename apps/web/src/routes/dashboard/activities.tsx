import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  History,
  Search,
  ArrowDownToLine,
  RefreshCw,
  Filter,
  Calendar,
  Shield,
  Activity,
  HelpCircle,
  Trash2,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import { Pagination } from "../../components/ui/Pagination";
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
      selectedActionType === "ALL" || (log.type || log.action) === selectedActionType;

    return matchesSearch && matchesAction;
  });

  const paginatedLogs = filteredLogs.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const getActionColor = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes("APPROVE") || act.includes("CREATE"))
      return "bg-muted text-foreground border-border"; // semantic neutral for success-ish
    if (
      act.includes("REJECT") ||
      act.includes("REVOKE") ||
      act.includes("DELETE")
    )
      return "bg-muted text-foreground border-border"; // semantic neutral
    if (act.includes("UPDATE") || act.includes("REASSIGN"))
      return "bg-muted text-foreground border-border"; // semantic neutral
    return "bg-muted text-muted-foreground border-border";
  };

  const renderActionBadge = (action: string) => {
    const act = action.toUpperCase();
    let color = "var(--muted-foreground)";
    if (act.includes("APPROVE") || act.includes("CREATE")) color = "var(--chart-green)";
    if (
      act.includes("REJECT") ||
      act.includes("REVOKE") ||
      act.includes("DELETE")
    )
      color = "var(--chart-red)";
    if (act.includes("UPDATE") || act.includes("REASSIGN"))
      color = "var(--chart-blue)";

    return (
      <span
        className="inline-flex rounded-full border border-border bg-muted px-2.5 py-0.5 font-bold uppercase tracking-widest text-[9px]"
        style={{ color }}
      >
        {action}
      </span>
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
  );

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
          <div className="inline-flex items-center gap-2 rounded-full bg-muted border border-border px-3 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <History className="h-3 w-3" />
            Audit Trail
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-foreground font-outfit">
            Log Aktivitas
          </h2>
          <p className="text-sm text-muted-foreground font-medium max-w-2xl leading-relaxed">
            Rekaman jejak audit dari seluruh mutasi akses, approval, dan
            perubahan status pengguna dalam sistem secara realtime.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted/50 transition-all shadow-sm cursor-pointer active:scale-95"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>

          <button
            onClick={exportLogsToCsv}
            disabled={filteredLogs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/10 hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
          >
            <ArrowDownToLine className="h-4 w-4" />
            Ekspor CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari aktor, tipe aksi, atau modul..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-border bg-card pl-12 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
          />
        </div>

        <div>
          <select
            value={selectedActionType}
            onChange={(e) => setSelectedActionType(e.target.value)}
            className="w-full h-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
          >
            <option value="ALL">Semua Jenis Aksi</option>
            {actionTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs Table Card */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="mt-4 text-xs font-bold uppercase tracking-widest">
              Memuat audit logs...
            </span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-24 text-center text-muted-foreground">
            <History className="mx-auto h-12 w-12 text-muted-foreground/20 mb-4" />
            <h3 className="font-bold text-foreground">Belum ada aktivitas</h3>
            <p className="text-xs mt-1 font-medium">
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
                        <button
                          onClick={() => handleDelete(log.id)}
                          disabled={deleting === log.id}
                          className="text-muted-foreground hover:text-chart-red p-2 rounded-xl hover:bg-chart-red/10 transition-all disabled:opacity-50 cursor-pointer active:scale-90"
                          title="Hapus log"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-border bg-muted/10">
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
      </div>
    </motion.div>
  );
}
