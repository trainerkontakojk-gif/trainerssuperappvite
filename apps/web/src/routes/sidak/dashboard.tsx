import { useState, useEffect } from "react";
import { useApi } from "../../hooks/useApi";
import type { DashboardData } from "@trainers/types";
import {
  BarChart3,
  TrendingDown,
  Users,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const SERVICE_LABELS: Record<string, string> = {
  call: "Call",
  chat: "Chat",
  email: "Email",
  cso: "CSO",
  pencatatan: "Pencatatan",
  bko: "BKO",
  slik: "SLIK",
};

const SERVICE_COLORS: Record<string, string> = {
  call: "#3B82F6",
  chat: "#10B981",
  email: "#F59E0B",
  cso: "#8B5CF6",
  pencatatan: "#EC4899",
  bko: "#06B6D4",
  slik: "#F97316",
};

export default function SidakDashboardPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [serviceType, setServiceType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, loading, refetch } = useApi<DashboardData>(
    `/sidak/dashboard?year=${year}${serviceType !== "all" ? `&service_type=${serviceType}` : ""}`,
  );

  const { data: yearsData } = useApi<{ years: number[] }>(
    "/sidak/dashboard/available-years",
  );

  useEffect(() => {
    setPage(1);
  }, [year, serviceType]);

  const years = yearsData?.years || [new Date().getFullYear()];
  const s = data?.summary;
  const hasData = data && (s?.totalAgents ?? 0) > 0;
  const hasNoPeriods =
    data && (s?.totalAgents ?? 0) === 0 && (s?.totalDefects ?? 0) === 0;

  const topAgents = data?.topAgents || [];
  const paginatedAgents = topAgents.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const totalPages = Math.ceil(topAgents.length / pageSize);

  const paretoData = (data?.paretoData || [])
    .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
    .slice(0, 8)
    .map(
      (
        p: { name: string; count: number; cumulative: number },
        i: number,
        arr: { count: number }[],
      ) => {
        const total = arr.reduce(
          (sum: number, x: { count: number }) => sum + x.count,
          0,
        );
        return {
          name: p.name.length > 20 ? p.name.slice(0, 20) + "..." : p.name,
          count: p.count,
          cumulative: total > 0 ? Math.round((p.cumulative / total) * 100) : 0,
        };
      },
    );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border shadow-sm p-4">
              <div className="h-10 w-10 bg-gray-200 rounded-lg animate-pulse" />
              <div className="mt-3 h-4 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="mt-2 h-6 w-12 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BarChart3 className="h-16 w-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700">
          Gagal memuat dashboard
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Terjadi kesalahan saat mengambil data. Silakan coba lagi.
        </p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  if (hasNoPeriods) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Filter className="h-16 w-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700">
          Belum ada periode audit
        </h3>
        <p className="text-sm text-gray-500 mt-1 max-w-md">
          Data SIDAK akan muncul setelah periode audit dibuat dan data temuan
          diupload. Hubungi admin untuk membuat periode baru.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard QA</h2>
          <p className="text-sm text-gray-500 mt-1">
            Ringkasan hasil audit kualitas per layanan dan periode.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600">Tahun</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600">Layanan</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="all">Semua</option>
              {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label="Total Agent"
          value={s?.totalAgents ?? 0}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Total Temuan"
          value={s?.totalDefects ?? 0}
          color="text-red-600"
          bg="bg-red-50"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Zero Error Rate"
          value={`${s?.zeroErrorRate?.toFixed(1) ?? 0}%`}
          color="text-green-600"
          bg="bg-green-50"
        />
        <MetricCard
          icon={TrendingDown}
          label="Avg Score"
          value={s?.avgAgentScore?.toFixed(1) ?? "0"}
          color="text-amber-600"
          bg="bg-amber-50"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Score Overview */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Overview Skor</h3>
          {hasData ? (
            <div className="space-y-3">
              <ScoreBar label="Avg Agent Score" value={s?.avgAgentScore ?? 0} />
              <ScoreBar
                label="Compliance Rate"
                value={s?.complianceRate ?? 0}
              />
              <div className="text-sm text-gray-500 mt-2">
                {s?.complianceCount ?? 0} agent comply (skor &ge;95)
              </div>
            </div>
          ) : (
            <EmptyChart message="Belum ada data untuk periode yang dipilih." />
          )}
        </div>

        {/* Pareto Chart */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Pareto Temuan</h3>
          {paretoData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={paretoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: unknown, name: unknown) => {
                    const n = String(name || "");
                    return [
                      n === "count" ? `${value} temuan` : `${value}%`,
                      n === "count" ? "Jumlah" : "Kumulatif",
                    ];
                  }}
                />
                <Bar dataKey="count" fill="#f43f5e" radius={[4, 4, 0, 0]}>
                  {paretoData.map((_: unknown, i: number) => (
                    <Cell
                      key={i}
                      fill={i < 3 ? "#f43f5e" : i < 5 ? "#f59e0b" : "#3b82f6"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Belum ada data parameter untuk pareto." />
          )}
        </div>
      </div>

      {/* Service Comparison */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h3 className="font-semibold mb-4">Perbandingan Layanan</h3>
        {data.serviceData.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.serviceData.map((svc) => (
              <div
                key={svc.serviceType}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
              >
                <span className="text-sm font-medium">{svc.name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (svc.total / Math.max(...data.serviceData.map((d) => d.total), 1)) * 100)}%`,
                        backgroundColor:
                          SERVICE_COLORS[svc.serviceType] || "#6b7280",
                      }}
                    />
                  </div>
                  <span className="font-medium text-sm w-6 text-right">
                    {svc.total}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyChart message="Tidak ada data layanan untuk filter yang dipilih." />
        )}
      </div>

      {/* Top Agents Table */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Agent dengan Defect Terbanyak</h3>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {paginatedAgents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Batch</th>
                  <th className="pb-2 font-medium text-right">Defect</th>
                  <th className="pb-2 font-medium text-right">Skor</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAgents.map((agent, idx) => (
                  <tr key={agent.agentId} className="border-b last:border-0">
                    <td className="py-2 text-gray-400">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="py-2 font-medium">{agent.nama}</td>
                    <td className="py-2 text-gray-500">{agent.batch}</td>
                    <td
                      className={`py-2 text-right font-medium ${agent.defects > 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {agent.defects}
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${agent.score >= 85 ? "bg-green-100 text-green-700" : agent.score >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}
                      >
                        {agent.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyChart message="Belum ada data agent." />
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center`}
        >
          <Icon size={20} className={color} />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-xl font-bold ${color}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 85 ? "bg-green-500" : value >= 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-medium">{value.toFixed(1)}</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <BarChart3 className="h-10 w-10 text-gray-200 mb-2" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}
