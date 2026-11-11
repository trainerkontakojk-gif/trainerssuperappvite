/**
 * Kontrak `GET /api/v1/home/attention` ("Perlu perhatian" di Beranda).
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
  /**
   * Satu peserta dengan ulang tahun terdekat (`participants.readAll`). Selalu
   * dikirim bila ada peserta bertanggal lahir; bukan tindakan, hanya pengingat.
   */
  "upcoming_birthday",
] as const;

export type HomeAttentionKind = (typeof HOME_ATTENTION_KINDS)[number];

/** Agen berisiko yang skornya paling jauh dari target. */
export interface HomeAttentionWorstAgent {
  agentId: string;
  nama: string;
  /** Rata-rata skor periode audit terakhir agen itu, 0–100. */
  score: number;
}

/** Peserta Profiler yang ulang tahunnya paling dekat (hari ini dalam WIB). */
export interface HomeAttentionBirthday {
  pesertaId: string;
  nama: string;
  /** Tanggal lahir `YYYY-MM-DD`. */
  tglLahir: string;
  /** Folder Profiler tempat peserta berada. */
  batchName: string;
  /** 0 = hari ini. */
  daysUntil: number;
  /** Usia yang dicapai pada ulang tahun itu. */
  age: number;
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
  /** Hanya pada `upcoming_birthday`. */
  birthday?: HomeAttentionBirthday;
}

export interface HomeAttentionResponse {
  items: HomeAttentionItem[];
  /** Ada sumber yang gagal dimuat; item dari sumber itu tidak dikirim. */
  partial: boolean;
}
