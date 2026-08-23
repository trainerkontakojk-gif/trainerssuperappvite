import { DEFAULT_USD_TO_IDR_RATE } from "@trainers/types";

export { DEFAULT_USD_TO_IDR_RATE };

type SupabaseAdminLike = {
  from: (table: string) => any;
};

function isMissingBillingKeyColumnError(error: any): boolean {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();

  if (error.code === "42703") {
    return (
      message.includes("ai_billing_settings.key") ||
      /column .*key/.test(message)
    );
  }

  if (error.code === "PGRST204") {
    return message.includes("schema cache") && message.includes("key");
  }

  return false;
}

function isMissingBillingConflictConstraintError(error: any): boolean {
  if (!error || error.code !== "42P10") return false;
  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("on conflict") &&
    (message.includes("unique") || message.includes("exclusion"))
  );
}

export async function getBillingRate(admin: SupabaseAdminLike): Promise<number> {
  const singletonResult = await admin
    .from("ai_billing_settings")
    .select("usd_to_idr_rate")
    .eq("key", "default")
    .maybeSingle();

  if (!singletonResult.error) {
    return singletonResult.data?.usd_to_idr_rate ?? DEFAULT_USD_TO_IDR_RATE;
  }

  if (!isMissingBillingKeyColumnError(singletonResult.error)) {
    throw singletonResult.error;
  }

  const legacyResult = await admin
    .from("ai_billing_settings")
    .select("usd_to_idr_rate")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacyResult.error) throw legacyResult.error;
  return legacyResult.data?.usd_to_idr_rate ?? DEFAULT_USD_TO_IDR_RATE;
}

export async function upsertBillingRate(
  admin: SupabaseAdminLike,
  usdToIdrRate: number,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const singletonResult = await admin.from("ai_billing_settings").upsert(
    {
      key: "default",
      usd_to_idr_rate: usdToIdrRate,
      updated_at: updatedAt,
    },
    { onConflict: "key" },
  );

  if (!singletonResult.error) return;

  const needsLegacyFallback =
    isMissingBillingKeyColumnError(singletonResult.error) ||
    isMissingBillingConflictConstraintError(singletonResult.error);

  if (!needsLegacyFallback) {
    throw singletonResult.error;
  }

  const existingResult = await admin
    .from("ai_billing_settings")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingResult.error) throw existingResult.error;

  if (existingResult.data?.id) {
    const updateResult = await admin
      .from("ai_billing_settings")
      .update({
        usd_to_idr_rate: usdToIdrRate,
        updated_at: updatedAt,
      })
      .eq("id", existingResult.data.id);

    if (updateResult.error) throw updateResult.error;
    return;
  }

  const insertResult = await admin.from("ai_billing_settings").insert({
    usd_to_idr_rate: usdToIdrRate,
    updated_at: updatedAt,
  });

  if (insertResult.error) throw insertResult.error;
}
