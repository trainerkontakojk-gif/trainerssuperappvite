import { can, normalizeRole } from "@trainers/types";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { useAuthStore } from "../../store/authStore";
import { aiClient, unwrapResponse } from "../../lib/api";
import { mapError } from "./utils/formatting";
import { HistoryTab } from "./components/HistoryTab";
import { BiayaTab } from "./components/BiayaTab";
import { PricingTab, type PricingEntry } from "./components/PricingTab";

export type MonitoringSection = "history" | "usage" | "pricing";

const SECTION_PATHS = {
  history: "/monitoring",
  usage: "/monitoring/biaya",
  pricing: "/monitoring/harga",
} as const satisfies Record<MonitoringSection, string>;

export default function MonitoringPage({
  section = "history",
}: {
  section?: MonitoringSection;
}) {
  const navigate = useNavigate();
  const tab = section;
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role?.toLowerCase() || "";
  const canEditPricing = can(normalizeRole(role), "monitoring.pricing.write");

  const [pricing, setPricing] = useState<PricingEntry[]>([]);
  const [billingRate, setBillingRate] = useState(15000);
  const [error, setError] = useState<string | null>(null);

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
    if (tab === "pricing") fetchPricing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="mx-auto w-full max-w-[var(--content-max-width)] space-y-6 p-4 lg:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title font-display text-foreground">
          Monitoring
        </h1>
        <p className="text-sm text-muted-foreground">
          Riwayat simulasi agen, biaya pemakaian AI, dan harga model.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({ to: SECTION_PATHS[value as MonitoringSection] })
        }
        className="mt-2"
      >
        <TabsList
          variant="line"
          aria-label="Bagian monitoring"
          className="min-h-12 h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-border"
        >
          <TabsTrigger
            value="history"
            id="monitoring-tab-history"
            className="min-h-12 flex-none px-5 text-sm font-semibold text-muted-foreground data-active:text-foreground data-active:after:bg-primary"
          >
            Riwayat
          </TabsTrigger>
          <TabsTrigger
            value="usage"
            id="monitoring-tab-usage"
            className="min-h-12 flex-none px-5 text-sm font-semibold text-muted-foreground data-active:text-foreground data-active:after:bg-primary"
          >
            Biaya AI
          </TabsTrigger>
          {canEditPricing && (
            <TabsTrigger
              value="pricing"
              id="monitoring-tab-pricing"
              className="min-h-12 flex-none px-5 text-sm font-semibold text-muted-foreground data-active:text-foreground data-active:after:bg-primary"
            >
              Harga &amp; kurs
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

        <TabsContent
          value="history"
          id="monitoring-panel-history"
          aria-labelledby="monitoring-tab-history"
          tabIndex={0}
        >
          <HistoryTab />
        </TabsContent>
        <TabsContent
          value="usage"
          id="monitoring-panel-usage"
          aria-labelledby="monitoring-tab-usage"
          tabIndex={0}
        >
          <BiayaTab />
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

    </div>
  );
}
