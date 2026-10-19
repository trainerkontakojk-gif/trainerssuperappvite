/**
 * Pengaman database untuk API dan Telefun. Proses yang dijalankan di luar
 * server produksi (laptop, Codex, skrip) tidak boleh memakai proyek Supabase
 * produksi tanpa sengaja: pekerjaan latar belakangnya menulis ke produksi dan
 * pembacaannya menghabiskan kuota egress. Railway dan Vercel dikenali dari
 * variabel yang mereka pasang sendiri.
 */

export const PRODUCTION_SUPABASE_REF = "ruosnjmtywcrghjgqugz";
export const ALLOW_PROD_DB_IN_DEV = "ALLOW_PROD_DB_IN_DEV";

const HOSTED_ENV_KEYS = [
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "RAILWAY_DEPLOYMENT_ID",
  "VERCEL",
] as const;

export type DevDatabaseGuardResult =
  | { kind: "ok" }
  | { kind: "allowed"; message: string }
  | { kind: "refused"; message: string };

export function checkDevDatabaseTarget(
  service: string,
  supabaseUrl: string,
  env: Record<string, string | undefined>,
): DevDatabaseGuardResult {
  const host = new URL(supabaseUrl).hostname;
  if (host !== `${PRODUCTION_SUPABASE_REF}.supabase.co`) return { kind: "ok" };
  if (HOSTED_ENV_KEYS.some((key) => Boolean(env[key]))) return { kind: "ok" };
  if (env[ALLOW_PROD_DB_IN_DEV] === "1") {
    return {
      kind: "allowed",
      message: `⚠️ [${service}] ${ALLOW_PROD_DB_IN_DEV}=1: sengaja memakai database produksi dari luar server produksi. Pekerjaan latar belakang akan menulis ke produksi.`,
    };
  }
  return {
    kind: "refused",
    message: `❌ [${service}] Menolak menyala: Supabase menunjuk database produksi (${PRODUCTION_SUPABASE_REF}) dari luar server produksi. Pakai database lokal (lihat apps/api/.env.integration), atau setel ${ALLOW_PROD_DB_IN_DEV}=1 bila memang sengaja.`,
  };
}
