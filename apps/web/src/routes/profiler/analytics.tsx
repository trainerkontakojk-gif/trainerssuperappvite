import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  PieChart as PieChartIcon,
  BarChart3,
  Users,
  Briefcase,
  GraduationCap,
  ChevronDown,
  X,
  Folder,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  Legend,
  ResponsiveContainer,
} from "recharts";
import PageHeroHeader from "../../components/PageHeroHeader";
import { useQueryParams } from "../../hooks/useQueryParams";
import { useProfilerAccess } from "../../hooks/useProfilerAccess";
import { profilerApi } from "../../lib/profilerService";
import type {
  ProfilerPeserta,
  ProfilerYear,
  ProfilerFolder,
} from "@trainers/types";
import { labelJabatan } from "@trainers/types";

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  // Recharts payload structure varies slightly between Pie and Bar
  const color = item.payload?.fill || item.color || item.fill;
  const name = item.payload?.name || label || item.name || "Data";
  const value = item.value;
  const suffix = typeof value === "number" ? "peserta" : "";

  return (
    <div className="bg-card border border-border/40 rounded-xl px-4 py-2.5 shadow-lg text-sm transition-all duration-200">
      <div className="flex items-center gap-2 min-w-[140px]">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse"
          style={{ backgroundColor: color }}
        />
        <span className="font-bold text-foreground">{name}</span>
        <span className="text-muted-foreground font-medium ml-auto pl-2">
          {value}
          {suffix ? ` ${suffix}` : ""}
        </span>
      </div>
    </div>
  );
};

export default function ProfilerAnalytics() {
  const navigate = useNavigate();
  const { batch } = useQueryParams();
  const selectedBatch = batch || "";

  const [peserta, setPeserta] = useState<ProfilerPeserta[]>([]);
  const [years, setYears] = useState<ProfilerYear[]>([]);
  const [folders, setFolders] = useState<ProfilerFolder[]>([]);

  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalData, setModalData] = useState<{
    title: string;
    participants: ProfilerPeserta[];
  } | null>(null);

  const { isReadOnly } = useProfilerAccess();

  useEffect(() => {
    Promise.all([profilerApi.getYears(), profilerApi.getFolders()])
      .then(([y, f]) => {
        setYears(y);
        setFolders(f);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedBatch) {
      setPeserta([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    profilerApi
      .getPesertaByBatch(selectedBatch)
      .then(setPeserta)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedBatch]);

  const handleBatchChange = (newBatch: string) => {
    if (newBatch === selectedBatch) {
      setShowPicker(false);
      return;
    }

    setShowPicker(false);
    navigate({
      to: "/profiler/analytics",
      search: { batch: newBatch },
    });
  };

  const stats = useMemo(() => {
    if (!peserta.length) return null;

    const jabatanCount: Record<string, number> = {};
    const genderCount: Record<string, number> = {};
    const pendidikanCount: Record<string, number> = {};
    const timCount: Record<string, number> = {};

    peserta.forEach((p) => {
      const jab = labelJabatan[p.jabatan || ""] || p.jabatan || "Tidak Diketahui";
      jabatanCount[jab] = (jabatanCount[jab] || 0) + 1;

      const gender = p.jenis_kelamin || "Tidak Diketahui";
      genderCount[gender] = (genderCount[gender] || 0) + 1;

      const pend = p.pendidikan || "Tidak Diketahui";
      pendidikanCount[pend] = (pendidikanCount[pend] || 0) + 1;

      const tim = p.tim || "Tidak Diketahui";
      timCount[tim] = (timCount[tim] || 0) + 1;
    });

    const formatData = (data: Record<string, number>, colorOffset = 0) =>
      Object.entries(data)
        .map(([name, value], index) => ({
          name,
          value,
          fill: COLORS[(index + colorOffset) % COLORS.length],
        }))
        .sort((a, b) => b.value - a.value);

    return {
      jabatan: formatData(jabatanCount, 0),
      gender: Object.entries(genderCount)
        .map(([name, value]) => ({
          name,
          value,
          fill:
            name === "Laki-laki"
              ? "#0088FE"
              : name === "Perempuan"
                ? "#FF8042"
                : "#FFBB28",
        }))
        .sort((a, b) => b.value - a.value),
      pendidikan: formatData(pendidikanCount, 6),
      tim: formatData(timCount, 4),
      total: peserta.length,
    };
  }, [peserta]);

  const handleChartClick = (
    category: string,
    value: string,
    filterFn: (p: ProfilerPeserta) => boolean
  ) => {
    const matched = peserta.filter(filterFn);
    setModalData({
      title: `${category}: ${value}`,
      participants: matched,
    });
  };

  return (
    <div className="h-full overflow-hidden bg-background">
      <main className="relative h-full overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
          <PageHeroHeader
            backHref={`/profiler?batch=${encodeURIComponent(selectedBatch)}`}
            backLabel="Kembali ke workspace KTP"
            eyebrow="Profiler analytics"
            title="Baca komposisi batch tanpa keluar dari ritme workspace yang sama."
            description="Statistik peserta, distribusi tim, jabatan, dan pendidikan disajikan dengan hierarki visual yang lebih rapi dan mudah dipindai."
            icon={<BarChart3 className="h-3.5 w-3.5" />}
            actions={
              <div className="relative w-full min-w-[260px] max-w-sm">
                <button
                  onClick={() => setShowPicker((v) => !v)}
                  className="w-full flex items-center gap-3 px-4 py-2 bg-card border border-border rounded-xl hover:bg-accent/50 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Folder className="w-4 h-4 text-primary" />
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[10px] text-foreground/50 font-bold uppercase tracking-widest">
                      Filter Folder
                    </p>
                    <p className="text-sm font-bold text-foreground truncate mt-0.5">
                      {selectedBatch || "Pilih folder..."}
                    </p>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-foreground/50 flex-shrink-0 transition-transform duration-200 ${
                      showPicker ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {showPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-50 max-h-96 flex flex-col"
                    >
                      <div className="p-3 border-b border-border bg-muted/10">
                        <p className="text-xs font-bold text-foreground/50 uppercase tracking-widest">
                          Pilih Folder Batch
                        </p>
                      </div>
                      <div className="overflow-y-auto p-2 space-y-4 custom-scrollbar">
                        {years.length === 0 ? (
                          <p className="text-sm text-foreground/50 text-center py-4">
                            Tidak ada data tahun.
                          </p>
                        ) : (
                          years.map((year) => {
                            const yearFolders = folders.filter(
                              (f) => f.year_id === year.id && !f.parent_id
                            );
                            if (yearFolders.length === 0) return null;

                            return (
                              <div key={year.id} className="space-y-2">
                                <p className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest px-2">
                                  {year.label}
                                </p>
                                <div className="space-y-1">
                                  {yearFolders.map((folder) => {
                                    const subFolders = folders.filter(
                                      (f) => f.parent_id === folder.id
                                    );
                                    return (
                                      <div
                                        key={folder.id}
                                        className="space-y-1"
                                      >
                                        <button
                                          onClick={() =>
                                            handleBatchChange(folder.name)
                                          }
                                          className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-xl transition-colors ${
                                            folder.name === selectedBatch
                                              ? "bg-primary/10 text-primary font-bold"
                                              : "text-foreground/80 hover:bg-accent"
                                          }`}
                                        >
                                          <span className="truncate">
                                            {folder.name}
                                          </span>
                                        </button>
                                        {subFolders.length > 0 && (
                                          <div className="pl-4 space-y-1 border-l-2 border-border/50 ml-3 mt-1">
                                            {subFolders.map((sub) => (
                                              <button
                                                key={sub.id}
                                                onClick={() =>
                                                  handleBatchChange(sub.name)
                                                }
                                                className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-xl transition-colors ${
                                                  sub.name === selectedBatch
                                                    ? "bg-primary/10 text-primary font-bold"
                                                    : "text-foreground/80 hover:bg-accent"
                                                }`}
                                              >
                                                <span className="truncate">
                                                  {sub.name}
                                                </span>
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            }
          />

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-[1.75rem] border border-border/60 bg-card/75 px-5 py-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                Batch aktif
              </p>
              <p className="mt-2 text-sm font-semibold">{selectedBatch}</p>
            </div>
            <div className="rounded-[1.75rem] border border-border/60 bg-card/75 px-5 py-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                Total peserta
              </p>
              <p className="mt-2 text-sm font-semibold">
                {peserta.length} orang
              </p>
            </div>
            <div className="rounded-[1.75rem] border border-border/60 bg-card/75 px-5 py-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                Mode akses
              </p>
              <p className="mt-2 text-sm font-semibold">
                {isReadOnly ? "Read only leader" : "Interactive analytics"}
              </p>
            </div>
          </div>

          <div className="w-full space-y-8">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                <p className="text-foreground/50 text-sm font-medium">
                  Memuat data statistik...
                </p>
              </div>
            ) : !stats ? (
              <div className="flex flex-col items-center justify-center py-20 bg-card rounded-[2rem] border border-border shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <BarChart3 className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-foreground/50 font-medium">
                  Tidak ada data peserta untuk folder ini.
                </p>
                {!isReadOnly && (
                  <button
                    onClick={() =>
                      navigate({
                        to: "/profiler/add",
                        search: { batch: selectedBatch },
                      })
                    }
                    className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-sm hover:opacity-90"
                  >
                    Tambah Data Pertama
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {[
                    {
                      label: "Total Peserta",
                      value: stats.total,
                      icon: Users,
                      color: "text-blue-500",
                      bg: "bg-blue-500/10",
                    },
                    {
                      label: "Total Jabatan",
                      value: stats.jabatan.length,
                      icon: Briefcase,
                      color: "text-emerald-500",
                      bg: "bg-emerald-500/10",
                    },
                    {
                      label: "Total Pendidikan",
                      value: stats.pendidikan.length,
                      icon: GraduationCap,
                      color: "text-purple-500",
                      bg: "bg-purple-500/10",
                    },
                    {
                      label: "Total Tim",
                      value: stats.tim.length,
                      icon: PieChartIcon,
                      color: "text-orange-500",
                      bg: "bg-orange-500/10",
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="bg-card border border-border rounded-3xl p-6 shadow-sm flex items-center gap-4"
                    >
                      <div
                        className={`w-12 h-12 rounded-2xl ${item.bg} flex items-center justify-center ${item.color}`}
                      >
                        <item.icon size={24} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          {item.label}
                        </p>
                        <p className="text-3xl font-black">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Jabatan Chart */}
                  <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col h-[400px]">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Distribusi Jabatan
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Klik batang grafik untuk melihat detail peserta
                    </p>
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={stats.jabatan}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            horizontal={false}
                            stroke="rgba(255,255,255,0.1)"
                          />
                          <XAxis type="number" />
                          <YAxis
                            dataKey="name"
                            type="category"
                            width={100}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip
                            content={<ChartTooltip />}
                            cursor={{ fill: "rgba(255,255,255,0.05)" }}
                          />
                          <Bar
                            dataKey="value"
                            radius={[0, 4, 4, 0]}
                            cursor="pointer"
                            onClick={(data) =>
                              handleChartClick(
                                "Jabatan",
                                (data.name || ""),
                                (p) =>
                                  (labelJabatan[p.jabatan || ""] || p.jabatan || "Tidak Diketahui") ===
                                  (data.name || "")
                              )
                            }
                          >
                            {stats.jabatan.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Tim Chart */}
                  <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col h-[400px]">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Distribusi Tim
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Klik potongan pie untuk melihat detail peserta
                    </p>
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.tim}
                            cx="50%"
                            cy="50%"
                            innerRadius={80}
                            outerRadius={120}
                            paddingAngle={5}
                            dataKey="value"
                            cursor="pointer"
                            onClick={(data) =>
                              handleChartClick(
                                "Tim",
                                (data.name || ""),
                                (p) =>
                                  (p.tim || "Tidak Diketahui") === (data.name || "")
                              )
                            }
                          >
                            {stats.tim.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Gender Chart */}
                  <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col h-[400px]">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Distribusi Gender
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Klik potongan pie untuk melihat detail peserta
                    </p>
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.gender}
                            cx="50%"
                            cy="50%"
                            outerRadius={120}
                            dataKey="value"
                            label={({ name, percent }) =>
                              `${name} ${((percent || 0) * 100).toFixed(0)}%`
                            }
                            cursor="pointer"
                            onClick={(data) =>
                              handleChartClick(
                                "Gender",
                                (data.name || ""),
                                (p) =>
                                  (p.jenis_kelamin || "Tidak Diketahui") ===
                                  (data.name || "")
                              )
                            }
                          >
                            {stats.gender.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            iconType="circle"
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Pendidikan Chart */}
                  <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col h-[400px]">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Tingkat Pendidikan
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Klik batang grafik untuk melihat detail peserta
                    </p>
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={stats.pendidikan}
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="rgba(255,255,255,0.1)"
                          />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip
                            content={<ChartTooltip />}
                            cursor={{ fill: "rgba(255,255,255,0.05)" }}
                          />
                          <Bar
                            dataKey="value"
                            radius={[4, 4, 0, 0]}
                            cursor="pointer"
                            onClick={(data) =>
                              handleChartClick(
                                "Pendidikan",
                                (data.name || ""),
                                (p) =>
                                  (p.pendidikan || "Tidak Diketahui") ===
                                  (data.name || "")
                              )
                            }
                          >
                            {stats.pendidikan.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Modal Popup */}
      <AnimatePresence>
        {modalData && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setModalData(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card w-full max-w-lg rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-muted/10">
                <div>
                  <h3 className="font-black text-lg tracking-tight">
                    {modalData.title}
                  </h3>
                  <p className="text-xs text-foreground/50 font-bold uppercase tracking-widest mt-1">
                    {modalData.participants.length} Peserta
                  </p>
                </div>
                <button
                  onClick={() => setModalData(null)}
                  className="p-2 hover:bg-accent rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto custom-scrollbar flex-1 bg-background/50">
                {modalData.participants.length > 0 ? (
                  <ul className="space-y-2">
                    {modalData.participants.map((p, i) => (
                      <li
                        key={p.id || i}
                        className="p-3 rounded-2xl bg-card border border-border flex items-center gap-4 hover:border-primary/30 transition-colors"
                      >
                        {p.foto_url ? (
                          <div className="relative w-10 h-10 rounded-full overflow-hidden border border-border">
                            <img
                              src={p.foto_url}
                              alt={p.nama || ""}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-sm border border-primary/20">
                            {p.nama?.charAt(0) || "?"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">
                            {p.nama}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest bg-accent px-2 py-0.5 rounded-md truncate">
                              {p.tim}
                            </span>
                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded-md truncate">
                              {labelJabatan[p.jabatan || ""] || p.jabatan}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground text-sm font-medium">
                      Tidak ada data peserta.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
