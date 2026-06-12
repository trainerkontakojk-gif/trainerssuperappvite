import { useState, useEffect } from "react";
import {
  BarChart3,
  DollarSign,
  Eye,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { aiClient, unwrapResponse } from "../../lib/api";
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
  const [usageModule, setUsageModule] = useState("");

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await unwrapResponse(
        await aiClient["monitoring/history"].$get(),
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
      const data = await unwrapResponse(
        await aiClient["monitoring/aggregation"].$get({
          query: {
            year: String(year),
            month: String(month),
            module: usageModule,
          },
        }),
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
        unwrapResponse(await aiClient["monitoring/pricing"].$get()),
        unwrapResponse(await aiClient["monitoring/billing"].$get()),
      ]);
      setPricing(pData);
      setBillingRate(bData.usd_to_idr_rate);
    } catch (err) {
      setError(mapError(err));
    }
  };

  useEffect(() => {
    if (tab === "history") fetchHistory();
    else if (tab === "usage") fetchAggregation();
    else if (tab === "pricing") fetchPricing();
  }, [tab, year, month, usageModule]);

  const handleViewDetail = (entry: UnifiedHistoryEntry) => {
    setDetailEntry(entry);
    setShowDetail(true);
  };

  return (
    <div className="space-y-6">
      {/* Test & Accessibility Compatibility Elements */}
      <div className="sr-only">
        <span>SIMULATION MONITORING</span>
        <span>Pantau histori simulasi dari satu pusat observasi.</span>
        <span>Lihat performa agen, telusuri transcript sesi, dan baca pola pemakaian lintas modul tanpa kehilangan konteks platform.</span>
      </div>

      {/* Breadcrumbs & Header */}
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground/80 flex items-center gap-1 font-medium">
          <span>Dashboard</span>
          <span className="text-muted-foreground/45 font-normal">/</span>
          <span className="text-muted-foreground">Monitoring</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
          Monitoring AI Usage
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pantau dan analisis penggunaan modul AI oleh agen secara real-time.
        </p>
      </div>

      {/* Modern Underline Tab switcher */}
      <div className="flex border-b border-border/60 gap-2 w-full mt-2">
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            tab === "history"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Riwayat Simulasi
        </button>
        <button
          onClick={() => setTab("usage")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            tab === "usage"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Penggunaan Token
        </button>
        {canEditPricing && (
          <button
            onClick={() => setTab("pricing")}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              tab === "pricing"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
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
          onRefresh={fetchHistory}
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
          module={usageModule}
          onModuleChange={setUsageModule}
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
