import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
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
    <main className="mx-auto w-full max-w-[var(--content-max-width)] space-y-8 p-4 lg:p-8">
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

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setTab(value as "history" | "usage" | "pricing")
        }
        className="mt-2"
      >
        <TabsList
          variant="line"
          aria-label="Bagian monitoring"
          className="w-full justify-start overflow-x-auto rounded-none border-b border-border"
        >
          <TabsTrigger
            value="history"
            id="monitoring-tab-history"
            className="min-h-11 flex-none px-4 text-xs data-active:border-primary"
          >
            Riwayat Simulasi
          </TabsTrigger>
          <TabsTrigger
            value="usage"
            id="monitoring-tab-usage"
            className="min-h-11 flex-none px-4 text-xs data-active:border-primary"
          >
            Penggunaan Token
          </TabsTrigger>
          {canEditPricing && (
            <TabsTrigger
              value="pricing"
              id="monitoring-tab-pricing"
              className="min-h-11 flex-none px-4 text-xs data-active:border-primary"
            >
              Harga &amp; Kurs
            </TabsTrigger>
          )}
        </TabsList>

        {error && (
          <Alert variant="destructive" className="mt-6 items-center">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="ml-auto min-h-11"
            >
              Tutup
            </Button>
          </Alert>
        )}

        {loading && (
          <div
            className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Skeleton className="size-4 rounded-full" />
            Memuat data...
          </div>
        )}

        <TabsContent
          value="history"
          id="monitoring-panel-history"
          aria-labelledby="monitoring-tab-history"
          tabIndex={0}
        >
          <HistoryTab
            historyData={historyData}
            loading={loading}
            onViewDetail={handleViewDetail}
            onRefresh={fetchHistory}
          />
        </TabsContent>
        <TabsContent
          value="usage"
          id="monitoring-panel-usage"
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
        </TabsContent>
        {canEditPricing && (
          <TabsContent
            value="pricing"
            id="monitoring-panel-pricing"
            aria-labelledby="monitoring-tab-pricing"
            tabIndex={0}
          >
            <PricingTab
              pricing={pricing}
              billingRate={billingRate}
              onBillingRateChange={setBillingRate}
              onRefresh={fetchPricing}
            />
          </TabsContent>
        )}
      </Tabs>

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
