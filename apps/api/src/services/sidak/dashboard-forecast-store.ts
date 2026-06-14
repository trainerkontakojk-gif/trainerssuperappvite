import { createAdminClient } from "../../lib/supabase";
import type { SidakBatchForecastSnapshot } from "@trainers/types";

export async function findForecastSnapshot(params: {
  filterKey: string;
  dataFingerprint: string;
  horizonMonths: number;
}): Promise<SidakBatchForecastSnapshot | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sidak_dashboard_forecast_snapshots")
    .select("payload")
    .eq("filter_key", params.filterKey)
    .eq("data_fingerprint", params.dataFingerprint)
    .eq("horizon_months", params.horizonMonths)
    .maybeSingle();

  if (error) {
    throw new Error(`Gagal membaca snapshot prediksi: ${error.message}`);
  }

  return (data?.payload as SidakBatchForecastSnapshot | undefined) ?? null;
}

export async function saveForecastSnapshot(params: {
  filterKey: string;
  dataFingerprint: string;
  horizonMonths: number;
  generatedBy: string;
  payload: SidakBatchForecastSnapshot;
}): Promise<SidakBatchForecastSnapshot> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("sidak_dashboard_forecast_snapshots")
    .upsert(
      {
        filter_key: params.filterKey,
        data_fingerprint: params.dataFingerprint,
        horizon_months: params.horizonMonths,
        generated_by: params.generatedBy,
        generated_at: params.payload.generatedAt,
        updated_at: new Date().toISOString(),
        payload: params.payload,
      },
      { onConflict: "filter_key,data_fingerprint,horizon_months" },
    );

  if (error) {
    throw new Error(`Gagal menyimpan snapshot prediksi: ${error.message}`);
  }

  return params.payload;
}

export async function hasForecastSnapshotForFilter(params: {
  filterKey: string;
  horizonMonths: number;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sidak_dashboard_forecast_snapshots")
    .select("id")
    .eq("filter_key", params.filterKey)
    .eq("horizon_months", params.horizonMonths)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Gagal memeriksa snapshot prediksi: ${error.message}`);
  }

  return Boolean(data);
}
