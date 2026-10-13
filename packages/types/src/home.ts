/**
 * Kontrak `GET /api/v1/home/attention` ("Perlu tindakan" di Beranda).
 *
 * Backend hanya mengirim item yang diizinkan capability pengguna dan yang
 * hitungannya > 0. Label dan CTA ditentukan UI dari `kind`.
 */
export const HOME_ATTENTION_KINDS = [
  /** Permintaan akses leader yang menunggu (`admin.leaderAccess`). */
  "leader_access_pending",
  /** Agen dengan skor periode terakhir di bawah target (`sidak.read`). */
  "agents_below_target",
  /** Periode QA bulan berjalan belum dibuat (`sidak.config.manage`). */
  "qa_period_missing",
] as const;

export type HomeAttentionKind = (typeof HOME_ATTENTION_KINDS)[number];

export interface HomeAttentionItem {
  kind: HomeAttentionKind;
  count: number;
  /** `team` bila data dibatasi scope leader. */
  scope: "all" | "team";
  /** Periode yang dimaksud, mis. bulan yang belum punya periode QA. */
  period?: { year: number; month: number };
}

export interface HomeAttentionResponse {
  items: HomeAttentionItem[];
  /** Ada sumber yang gagal dimuat; item dari sumber itu tidak dikirim. */
  partial: boolean;
}
