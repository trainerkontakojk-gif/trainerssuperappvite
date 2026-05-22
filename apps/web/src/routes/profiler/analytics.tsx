import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Users,
  Briefcase,
  GraduationCap,
  BarChart3,
} from "lucide-react";
import { useQueryParams } from "../../hooks/useQueryParams";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { profilerApi } from "../../lib/profilerService";
import type { ProfilerPeserta } from "@trainers/types";

const COLORS = [
  "#f59e0b",
  "#6366f1",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

export default function ProfilerAnalytics() {
  const { batch } = useQueryParams();
  const batchName = batch || "";

  const [peserta, setPeserta] = useState<ProfilerPeserta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!batchName) return;
    profilerApi
      .getPesertaByBatch(batchName)
      .then(setPeserta)
      .finally(() => setLoading(false));
  }, [batchName]);

  const timData = Object.entries(
    peserta.reduce(
      (acc, p) => {
        acc[p.tim] = (acc[p.tim] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).map(([name, value]) => ({ name, value }));

  const jabatanData = Object.entries(
    peserta.reduce(
      (acc, p) => {
        acc[p.jabatan] = (acc[p.jabatan] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const genderData = Object.entries(
    peserta.reduce(
      (acc, p) => {
        const g = p.jenis_kelamin || "Tidak diketahui";
        acc[g] = (acc[g] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).map(([name, value]) => ({ name, value }));

  const pendidikanData = Object.entries(
    peserta.reduce(
      (acc, p) => {
        const pend = p.pendidikan || "Tidak diketahui";
        acc[pend] = (acc[pend] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  if (!batchName) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Pilih batch terlebih dahulu.</p>
        <Link
          to="/profiler"
          className="mt-4 inline-flex items-center gap-2 text-indigo-600 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/profiler"
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Kembali
        </Link>
        <h2 className="text-lg font-bold text-gray-900 mt-1">
          Statistik Peserta — {batchName}
        </h2>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            icon: Users,
            label: "Total Peserta",
            value: peserta.length,
            color: "text-amber-600",
            bg: "bg-amber-100",
          },
          {
            icon: Briefcase,
            label: "Total Jabatan",
            value: jabatanData.length,
            color: "text-indigo-600",
            bg: "bg-indigo-100",
          },
          {
            icon: GraduationCap,
            label: "Total Pendidikan",
            value: pendidikanData.length,
            color: "text-emerald-600",
            bg: "bg-emerald-100",
          },
          {
            icon: BarChart3,
            label: "Total Tim",
            value: timData.length,
            color: "text-violet-600",
            bg: "bg-violet-100",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border bg-white p-4 shadow-sm"
          >
            <div
              className={`w-9 h-9 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center mb-3`}
            >
              <stat.icon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Memuat...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Distribusi Tim */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              Distribusi Tim
            </h3>
            {timData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Tidak ada data
              </p>
            ) : (
              <div className="flex items-center justify-center h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={timData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {timData.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Distribusi Jabatan */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              Distribusi Jabatan
            </h3>
            {jabatanData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Tidak ada data
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={jabatanData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={100}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      fill="#f59e0b"
                      radius={[0, 4, 4, 0]}
                      name="Jumlah"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Distribusi Gender */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              Distribusi Gender
            </h3>
            {genderData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Tidak ada data
              </p>
            ) : (
              <div className="flex items-center justify-center h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={genderData}
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {genderData.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={idx === 0 ? "#6366f1" : "#f472b6"}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Tingkat Pendidikan */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              Tingkat Pendidikan
            </h3>
            {pendidikanData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Tidak ada data
              </p>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pendidikanData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      name="Jumlah"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
