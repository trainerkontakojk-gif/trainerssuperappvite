import type { ServiceType } from "./sidak";

/** Only self QA aggregates; no profile, tickets, notes or peer data. */
export interface AgentHomeSummary {
  linked: boolean;
  qa: null | {
    serviceType: ServiceType;
    periodLabel: string;
    score: number;
    target: 95;
    gapToTarget: number | null;
    previousLabel: string | null;
    delta: number | null;
    trend: { periodLabel: string; score: number }[];
    topParameters: { name: string; count: number }[];
    recommendation: string | null;
  };
}

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

/** Agen berisiko yang skornya paling jauh dari target. */
export interface HomeAttentionWorstAgent {
  agentId: string;
  nama: string;
  /** Rata-rata skor periode audit terakhir agen itu, 0–100. */
  score: number;
}

export interface HomeAttentionItem {
  kind: HomeAttentionKind;
  count: number;
  /** `team` bila data dibatasi scope leader. */
  scope: "all" | "team";
  /** Periode yang dimaksud, mis. bulan yang belum punya periode QA. */
  period?: { year: number; month: number };
  /**
   * Maksimal tiga agen dengan skor terendah (urut skor naik, seri diurutkan
   * nama), hanya pada `agents_below_target` dan hanya dari direktori yang sudah
   * dibatasi scope pemanggil.
   */
  worstAgents?: HomeAttentionWorstAgent[];
}

export interface HomeAttentionResponse {
  items: HomeAttentionItem[];
  /** Ada sumber yang gagal dimuat; item dari sumber itu tidak dikirim. */
  partial: boolean;
}
