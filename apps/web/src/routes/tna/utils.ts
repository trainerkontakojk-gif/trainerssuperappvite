import { useState } from "react";
import type { TnaMetricsSnapshot, TnaPlanStatus } from "@trainers/types";
import { unwrapResponse } from "../../lib/api/unwrap-response";

class TnaConflictError extends Error {}
// Keep typed RPC envelopes and the existing auth transport; classify actual HTTP 409.
export async function tnaResponse<
  T extends Parameters<typeof unwrapResponse>[0],
>(request: Promise<T>) {
  const response = await request;
  if (response.status === 409)
    throw new TnaConflictError("Rencana sudah berubah, muat ulang");
  return unwrapResponse(response);
}
export const planStatusLabels: Record<TnaPlanStatus, string> = {
  draft: "Draf",
  aktif: "Aktif",
  evaluasi: "Evaluasi",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};
export const interventionLabels = {
  kelas: "Kelas",
  kelompok_kecil: "Kelompok kecil",
  coaching_individu: "Coaching individu",
};
export const clusterLabels = {
  salah_nama_perusahaan_produk: "Salah nama perusahaan atau produk",
  kelebihan_standar_jawaban: "Kelebihan standar jawaban",
  salah_penggunaan_sistem: "Salah penggunaan sistem",
  salah_jawaban: "Salah jawaban",
  kurang_teliti_verifikasi_data: "Kurang teliti verifikasi data",
  kurang_paham_standar_jawaban: "Kurang paham standar jawaban",
  kurang_menggali: "Kurang menggali",
  lainnya: "Lainnya",
};
export const number = (value: number | null) =>
  value === null
    ? "Belum tersedia"
    : value.toLocaleString("id-ID", { maximumFractionDigits: 1 });
export function trend(m: TnaMetricsSnapshot) {
  switch (m.trendStatus) {
    case "no_current_audit":
      return "Belum ada audit pada periode ini";
    case "no_comparison_data":
      return "Belum ada periode pembanding";
    case "new_from_zero":
      return "Baru muncul; periode pembanding tidak punya temuan";
    case "no_findings_both":
      return "Tidak ada temuan, baik pada periode ini maupun periode pembanding";
    case "computed":
      return Math.abs(m.trendPct ?? 0) < 5
        ? "Stabil dari rata-rata periode pembanding"
        : `${(m.trendPct ?? 0) > 0 ? "Naik" : "Turun"} ${number(Math.abs(m.trendPct ?? 0))}% dari rata-rata periode pembanding`;
  }
}
export const selectClass =
  "h-[44px] w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-foreground";
export function useTnaMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const reset = () => {
    setError(null);
    setConflict(false);
    setSuccess(null);
  };
  async function run(
    action: () => Promise<unknown>,
    message = "Perubahan tersimpan",
  ) {
    if (busy || conflict) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(message);
    } catch (e) {
      const stale = e instanceof TnaConflictError;
      setConflict(stale);
      setError(
        stale
          ? "Rencana sudah berubah, muat ulang"
          : e instanceof Error
            ? e.message
            : "Perubahan gagal disimpan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, conflict, success, reset, run };
}
export function parameterQuery(
  service: string,
  period: string,
  indicator: string,
  compare: number,
) {
  return new URLSearchParams({
    service_type: service,
    period_id: period,
    indicator_id: indicator,
    compare_count: String(compare),
  }).toString();
}
