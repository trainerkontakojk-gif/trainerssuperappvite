import { useState, useEffect } from "react";
import { TrendingUp, Zap } from "lucide-react";
import ParamTrendChart from "./ParamTrendChart";
import QaStatePanel from "./QaStatePanel";

interface TrendDataset {
  label: string;
  data: number[];
  isTotal: boolean;
}

interface Props {
  labels: string[];
  datasets: TrendDataset[];
  loading?: boolean;
}

const TREND_COLORS = [
  "#0F766E", // Teal
  "#D97706", // Amber
  "#2563EB", // Blue
  "#BE123C", // Rose
  "#4338CA", // Indigo
  "#0891B2", // Cyan
];

export default function AgentTrendTab({ labels, datasets, loading }: Props) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted)
    return <div className="h-[400px] bg-muted/10 animate-pulse rounded-2xl" />;

  const trendRangeLabel =
    labels.length > 0 ? `${labels[0]} - ${labels[labels.length - 1]}` : "";

  if (loading) {
    return (
      <div className="bg-card/50 backdrop-blur-sm rounded-[2rem] border border-border/50 p-6 sm:p-8 h-[520px] flex items-center justify-center">
        <QaStatePanel
          type="loading"
          title="Memuat tren performa agen"
          description="Riwayat penilaian sedang disiapkan."
          className="w-full max-w-lg"
        />
      </div>
    );
  }

  if (!labels.length || !datasets.length) {
    return (
      <div className="bg-card/50 backdrop-blur-sm rounded-[2rem] border border-border/50 p-6 sm:p-8">
        <QaStatePanel
          type="empty"
          title="Data tren belum tersedia"
          description="Tren akan muncul setelah ada penilaian pada periode yang dipilih."
        />
      </div>
    );
  }

  const paramDatasets = datasets.filter((ds) => !ds.isTotal);
  const totalDataset = datasets.find((ds) => ds.isTotal);
  const isFiltered = activeFilter !== null && activeFilter !== "TOTAL_ONLY";
  const isTotalOnly = activeFilter === "TOTAL_ONLY";

  // Build color map based on ORIGINAL index in full datasets array
  const colorMap: Record<string, string> = {};
  datasets.forEach((ds, i) => {
    if (!ds.isTotal) {
      colorMap[ds.label] = TREND_COLORS[i % TREND_COLORS.length];
    }
  });

  // Determine which datasets to pass to chart
  const chartDatasets = isFiltered
    ? datasets.filter((ds) => ds.isTotal || ds.label === activeFilter)
    : isTotalOnly
      ? datasets.filter((ds) => ds.isTotal)
      : datasets;

  const hiddenKeys = isFiltered
    ? new Set(
        paramDatasets
          .filter((ds) => ds.label !== activeFilter)
          .map((ds) => ds.label),
      )
    : new Set<string>();

  const showTotal = !isFiltered;

  return (
    <div className="bg-card/50 backdrop-blur-sm rounded-[2rem] border border-border/50 p-5 sm:p-8 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.24em] text-muted-foreground mb-2">
            <TrendingUp className="w-3.5 h-3.5" />
            Tren Kinerja {trendRangeLabel ? `• ${trendRangeLabel}` : ""}
          </div>
          <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
            Pergerakan skor per periode audit
          </h3>
          <p className="text-[11px] text-muted-foreground font-medium mt-2">
            Pantau tren temuan agen setiap periode penilaian pada tahun yang dipilih.
          </p>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setActiveFilter(null)}
          className={`px-4 py-2 rounded-xl text-[9px] font-black tracking-widest transition-all duration-500 border-2 ${
            activeFilter === null
              ? "bg-primary border-primary text-white shadow-xl shadow-primary/20 scale-105"
              : "bg-card/40 border-border/50 text-muted-foreground hover:border-foreground/20 hover:text-muted-foreground"
          }`}
        >
          Ringkasan
        </button>
        <button
          onClick={() => setActiveFilter(activeFilter === "TOTAL_ONLY" ? null : "TOTAL_ONLY")}
          className={`px-4 py-2 rounded-xl text-[9px] font-black tracking-widest transition-all duration-500 border-2 flex items-center gap-2 ${
            activeFilter === "TOTAL_ONLY"
              ? "bg-primary border-primary text-white shadow-xl shadow-primary/20 scale-105"
              : "bg-card/40 border-border/50 text-muted-foreground hover:border-foreground/20 hover:text-muted-foreground"
          }`}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: activeFilter === "TOTAL_ONLY" ? "white" : "hsl(var(--primary))" }}
          />
          Total Temuan
        </button>
        {paramDatasets.map((ds) => {
          const isActive = activeFilter === ds.label;
          const color = colorMap[ds.label] || "#888";
          return (
            <button
              key={ds.label}
              onClick={() => setActiveFilter(isActive ? null : ds.label)}
              className={`px-4 py-2 rounded-xl text-[9px] font-black tracking-widest transition-all duration-500 border-2 flex items-center gap-2 ${
                isActive
                  ? "bg-primary border-primary text-white shadow-xl shadow-primary/20 scale-105"
                  : "bg-card/40 border-border/50 text-muted-foreground hover:border-foreground/20 hover:text-muted-foreground"
              }`}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: isActive ? "white" : color }}
              />
              {ds.label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="h-[380px] w-full relative rounded-[1.5rem] border border-border/40 bg-background/70 p-3 shadow-inner">
        <ParamTrendChart
          labels={labels}
          datasets={chartDatasets}
          showParameters={true}
          hiddenKeys={hiddenKeys}
          hideTotal={!showTotal}
          filterLabel={activeFilter || undefined}
          isFiltered={isFiltered}
          colorMap={colorMap}
        />
      </div>

      {/* Stats Footer */}
      <div className="mt-8 pt-8 border-t border-border/50 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-foreground/[0.02] border border-border/30">
          <p className="text-[10px] font-black tracking-widest text-muted-foreground mb-3">
            Total Periode
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">
              {labels.length}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground tracking-widest">
              periode aktif
            </span>
          </div>
        </div>
        <div className="md:col-span-2 p-5 rounded-2xl bg-primary/5 border border-primary/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black tracking-widest text-primary/40 mb-1">
              Ringkasan Tren
            </p>
            <p className="text-sm font-medium text-foreground/70 leading-relaxed">
              Gunakan pola naik-turun setiap parameter untuk menentukan fokus
              coaching pada periode berikutnya.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
