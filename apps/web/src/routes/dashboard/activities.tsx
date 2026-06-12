import { useState, useEffect } from "react";
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
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (
      act.includes("REJECT") ||
      act.includes("REVOKE") ||
      act.includes("DELETE")
    )
      return "bg-red-50 text-red-700 border-red-100";
    if (act.includes("UPDATE") || act.includes("REASSIGN"))
      return "bg-indigo-50 text-indigo-700 border-indigo-100";
    return "bg-slate-50 text-slate-700 border-slate-100";
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
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <History className="h-3.5 w-3.5" />
            Audit Trail
          </div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Log Aktivitas
          </h2>
          <p className="mt-1 text-gray-500">
            Rekaman jejak audit dari seluruh mutasi akses, approval, dan
            perubahan status pengguna.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-gray-400 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>

          <button
            onClick={exportLogsToCsv}
            disabled={filteredLogs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/10 hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <ArrowDownToLine className="h-4 w-4" />
            Ekspor CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari aktor, target user, detail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white pl-12 pr-4 py-3 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>

        <div>
          <select
            value={selectedActionType}
            onChange={(e) => setSelectedActionType(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
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
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <span className="mt-4 text-sm font-medium">
              Memuat audit logs...
            </span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <History className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <h3 className="font-semibold text-gray-900">Belum ada aktivitas</h3>
            <p className="text-xs text-gray-500 mt-1">
              Belum ada rekaman mutasi yang terekam.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="px-6 py-4">Waktu</th>
                    <th className="px-6 py-4">Aktor</th>
                    <th className="px-6 py-4">Aksi</th>
                    <th className="px-6 py-4">Tipe</th>
                    <th className="px-6 py-4">Modul</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs text-gray-700">
                  {paginatedLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-gray-500 font-medium">
                        {new Date(log.created_at).toLocaleString("id-ID")}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-900">
                        {log.user_name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded border px-2 py-0.5 font-bold uppercase tracking-wide text-[10px] ${getActionColor(log.action)}`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {log.type || "-"}
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {log.module || "-"}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleDelete(log.id)}
                          disabled={deleting === log.id}
                          className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
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
            <div className="px-6 py-4 border-t">
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
    </div>
  );
}
