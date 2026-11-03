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

const FINGERPRINT_LIST_LIMIT = 500;

/**
 * Data fingerprints stored for this filter and horizon, newest first.
 * `complete` is false when the filter has more snapshots than were listed, so
 * an absent fingerprint must still be looked up directly.
 */
export async function listForecastFingerprints(params: {
  filterKey: string;
  horizonMonths: number;
}): Promise<{ fingerprints: string[]; complete: boolean }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sidak_dashboard_forecast_snapshots")
    .select("data_fingerprint")
    .eq("filter_key", params.filterKey)
    .eq("horizon_months", params.horizonMonths)
    .order("updated_at", { ascending: false })
    .limit(FINGERPRINT_LIST_LIMIT);

  if (error) {
    throw new Error(`Gagal memeriksa snapshot prediksi: ${error.message}`);
  }

  const fingerprints = (data ?? []).map(
    (row) => row.data_fingerprint as string,
  );
  return {
    fingerprints,
    complete: fingerprints.length < FINGERPRINT_LIST_LIMIT,
  };
}
