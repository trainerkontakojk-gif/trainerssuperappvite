import { useState, useEffect } from "react";
import {
  BarChart3,
  DollarSign,
  Eye,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getApi } from "../../hooks/useApi";
import { mapError, type UnifiedHistoryEntry } from "./utils/formatting";
import { HistoryTab } from "./components/HistoryTab";
import { UsageTab, type UsageAggregation } from "./components/UsageTab";
import { PricingTab, type PricingEntry } from "./components/PricingTab";
import { ReviewDetailModal } from "./components/ReviewDetailModal";

export default function MonitoringPage() {
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role?.toLowerCase() || "";
  const canEditPricing = role === "trainer" || role === "admin";

  const [tab, setTab] = useState<"history" | "usage" | "pricing">("history");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [aggregation, setAggregation] = useState<UsageAggregation[]>([]);
  const [pricing, setPricing] = useState<PricingEntry[]>([]);
  const [billingRate, setBillingRate] = useState(15000);
  const [historyData, setHistoryData] = useState<UnifiedHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<UnifiedHistoryEntry | null>(
    null,
  );
  const [showDetail, setShowDetail] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getApi<UnifiedHistoryEntry[]>(
        "/ai/monitoring/history",
      );
      setHistoryData(data);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchAggregation = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getApi<UsageAggregation[]>(
        `/ai/monitoring/aggregation?year=${year}&month=${month}`,
      );
      setAggregation(data);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchPricing = async () => {
    if (!canEditPricing) return;
    setError(null);
    try {
      const [pData, bData] = await Promise.all([
        getApi<PricingEntry[]>("/ai/monitoring/pricing"),
        getApi<{ usd_to_idr_rate: number }>("/ai/monitoring/billing"),
      ]);
      setPricing(pData);
      setBillingRate(bData?.usd_to_idr_rate ?? 15000);
    } catch (err) {
      setError(mapError(err));
    }
  };

  useEffect(() => {
    if (tab === "history") fetchHistory();
    else if (tab === "usage") fetchAggregation();
    else if (tab === "pricing") fetchPricing();
  }, [tab, year, month]);

  const handleViewDetail = (entry: UnifiedHistoryEntry) => {
    setDetailEntry(entry);
    setShowDetail(true);
  };

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 md:p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-primary mb-4">
          <Sparkles size={12} />
          SIMULATION MONITORING
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Pantau histori simulasi dari satu pusat observasi.
        </h1>
        <p className="max-w-3xl text-sm md:text-base leading-relaxed text-muted-foreground mt-3">
          Lihat performa agen, telusuri transcript sesi, dan baca pola pemakaian
          lintas modul tanpa kehilangan konteks platform.
        </p>
      </div>

      {/* Tab Strip */}
      <div className="flex gap-2 mb-2 border-b border-border">
        <button
          onClick={() => setTab("history")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all ${
            tab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Eye size={16} />
          Riwayat Simulasi
        </button>
        <button
          onClick={() => setTab("usage")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all ${
            tab === "usage"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 size={16} />
          Penggunaan Token
        </button>
        {canEditPricing && (
          <button
            onClick={() => setTab("pricing")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all ${
              tab === "pricing"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <DollarSign size={16} />
            Harga & Kurs
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button
            className="ml-auto text-xs underline hover:opacity-80"
            onClick={() => setError(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Memuat data...
        </div>
      )}

      {/* Tab Content */}
      {tab === "history" && (
        <HistoryTab
          historyData={historyData}
          loading={loading}
          onViewDetail={handleViewDetail}
        />
      )}
      {tab === "usage" && (
        <UsageTab
          aggregation={aggregation}
          loading={loading}
          year={year}
          month={month}
          onYearChange={setYear}
          onMonthChange={setMonth}
        />
      )}
      {tab === "pricing" && canEditPricing && (
        <PricingTab
          pricing={pricing}
          billingRate={billingRate}
          onBillingRateChange={setBillingRate}
          onRefresh={fetchPricing}
        />
      )}

      {/* Detail Modal */}
      {showDetail && detailEntry && (
        <ReviewDetailModal
          entry={detailEntry}
          onClose={() => {
            setShowDetail(false);
            setDetailEntry(null);
          }}
        />
      )}
    </div>
  );
}
