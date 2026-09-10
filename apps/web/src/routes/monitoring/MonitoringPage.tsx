import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
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
    <main className="p-4 lg:p-8 max-w-[var(--content-max-width)] mx-auto space-y-8 w-full animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
      {/* Test & Accessibility Compatibility Elements */}
      <div className="sr-only">
        <span>SIMULATION MONITORING</span>
        <span>Pantau histori simulasi dari satu pusat observasi.</span>
        <span>
          Lihat performa agen, telusuri transcript sesi, dan baca pola pemakaian
          lintas modul tanpa kehilangan konteks platform.
        </span>
      </div>

      {/* Breadcrumbs & Header */}
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground/80 flex items-center gap-1 font-medium">
          <span>Dashboard</span>
          <span className="text-muted-foreground/45 font-normal">/</span>
          <span className="text-muted-foreground">Monitoring</span>
        </div>
        <h1 className="text-page-title font-display text-foreground mt-2">
          Monitoring AI Usage
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pantau dan analisis penggunaan modul AI oleh agen secara real-time.
        </p>
      </div>

      {/* Modern Underline Tab switcher */}
      <div
        role="tablist"
        aria-label="Bagian monitoring"
        className="flex w-full gap-2 overflow-x-auto border-b border-border/60 mt-2"
      >
        <button
          type="button"
          id="monitoring-tab-history"
          role="tab"
          aria-selected={tab === "history"}
          aria-controls="monitoring-panel-history"
          onClick={() => setTab("history")}
          className={`min-h-11 whitespace-nowrap px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            tab === "history"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Riwayat Simulasi
        </button>
        <button
          type="button"
          id="monitoring-tab-usage"
          role="tab"
          aria-selected={tab === "usage"}
          aria-controls="monitoring-panel-usage"
          onClick={() => setTab("usage")}
          className={`min-h-11 whitespace-nowrap px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            tab === "usage"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Penggunaan Token
        </button>
        {canEditPricing && (
          <button
            type="button"
            id="monitoring-tab-pricing"
            role="tab"
            aria-selected={tab === "pricing"}
            aria-controls="monitoring-panel-pricing"
            onClick={() => setTab("pricing")}
            className={`min-h-11 whitespace-nowrap px-4 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
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
        <div
          className="flex items-center gap-2 px-4 py-3 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20"
          role="alert"
        >
          <AlertCircle size={14} aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            className="ml-auto min-h-11 px-2 text-xs underline hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
            onClick={() => setError(null)}
          >
            Tutup
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground py-4"
          role="status"
          aria-live="polite"
        >
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin motion-reduce:animate-none" />
          Memuat data...
        </div>
      )}

      {/* Tab Content */}
      {tab === "history" && (
        <div
          id="monitoring-panel-history"
          role="tabpanel"
          aria-labelledby="monitoring-tab-history"
          tabIndex={0}
        >
          <HistoryTab
            historyData={historyData}
            loading={loading}
            onViewDetail={handleViewDetail}
            onRefresh={fetchHistory}
          />
        </div>
      )}
      {tab === "usage" && (
        <div
          id="monitoring-panel-usage"
          role="tabpanel"
          aria-labelledby="monitoring-tab-usage"
          tabIndex={0}
        >
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
        </div>
      )}
      {tab === "pricing" && canEditPricing && (
        <div
          id="monitoring-panel-pricing"
          role="tabpanel"
          aria-labelledby="monitoring-tab-pricing"
          tabIndex={0}
        >
          <PricingTab
            pricing={pricing}
            billingRate={billingRate}
            onBillingRateChange={setBillingRate}
            onRefresh={fetchPricing}
          />
        </div>
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
    </main>
  );
}
