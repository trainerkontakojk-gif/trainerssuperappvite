/**
 * Root-cause registry and matcher for audit-root-cause-coverage.mjs.
 * Mirrors apps/api/src/services/sidak/agent-root-causes.ts; keep in sync.
 * This script is read-only and only measures coverage.
 */

import { normalizeText } from "./root-cause-phrase-extract.mjs";

export const ROOT_CAUSE_REGISTRY = [
  {
    clusterId: "salah_nama_perusahaan_produk",
    priority: 10,
    label: "Salah nama perusahaan/produk",
    keywords: [
      "nama perusahaan salah",
      "salah nama perusahaan",
      "nama produk salah",
      "penulisan nama pujk tidak sesuai",
    ],
  },
  {
    clusterId: "kelebihan_standar_jawaban",
    priority: 9,
    label: "Jawaban melebihi standar",
    keywords: [
      "sj tidak diperlukan",
      "standar jawaban tidak diperlukan",
      "informasi berlebihan",
      "penjelasan berlebihan",
      "di luar konteks pertanyaan",
    ],
  },
  {
    clusterId: "salah_penggunaan_sistem",
    priority: 9,
    label: "Kesalahan penggunaan sistem/APPK",
    keywords: ["appk", "pada appk", "di appk"],
  },
  {
    clusterId: "hold_waktu_tunggu",
    priority: 9,
    label: "Durasi hold/waktu tunggu melebihi standar",
    keywords: [
      "melakukan hold",
      "hold pertama",
      "hold kedua",
      "hold berikutnya",
      "durasi hold",
      "waktu hold",
      "fitur hold",
      "waktu tunggu",
      "dead air",
      "izin hold",
      "tombol hold",
      "menggunakan hold",
    ],
  },
  {
    clusterId: "salah_jawaban",
    priority: 8,
    label: "Jawaban salah/tidak akurat",
    keywords: [
      "salah jawaban",
      "jawaban salah",
      "informasi tidak akurat",
      "tidak sesuai ketentuan",
      "tidak sesuai dalam memilih",
      "tidak sesuai memilih",
      "salah memilih",
      "tidak sesuai dalam memberikan",
      "tidak sesuai dalam menuliskan",
      "tidak sesuai menuliskan",
      "tidak sesuai dalam menyampaikan",
      "tidak sesuai dalam melakukan",
      "salah menulis",
      "tidak memberikan jawaban",
      "belum memperbaiki",
      "tidak tepat dalam menjawab",
      "tidak tepat dalam memberikan",
      "tidak tepat dalam menyampaikan",
      "tidak menjawab",
    ],
  },
  {
    clusterId: "proses_ideb_slik",
    priority: 8,
    label: "Proses verifikasi/pengiriman iDeb SLIK tidak sesuai",
    serviceTypes: ["slik"],
    keywords: [
      "pendaftaran ideb",
      "permohonan ideb",
      "hasil ideb",
      "ideb slik",
      "alasan penolakan",
      "gagal verifikasi",
      "foto diri mengikuti gambar",
    ],
  },
  {
    clusterId: "kurang_teliti_verifikasi_data",
    priority: 7,
    label: "Kurang teliti verifikasi data",
    keywords: [
      "kurang teliti",
      "verifikasi data",
      "tidak verifikasi",
      "tidak melakukan verifikasi",
      "salah verifikasi",
      "data tidak sesuai",
      "tidak mengecek data",
      "konfirmasi data",
      "tidak sesuai mencatat",
      "tidak mencatat",
      "tidak menuliskan",
      "tidak melampirkan",
      "tidak sesuai dalam mencatat",
      "belum sesuai dalam mencatat",
    ],
  },
  {
    clusterId: "kurang_paham_standar_jawaban",
    priority: 6,
    label: "Kurang paham standar jawaban",
    keywords: [
      "kurang paham standar jawaban",
      "tidak memahami standar jawaban",
      "tidak sesuai sj",
      "tidak mengikuti standar jawaban",
      "standar jawaban",
      "panduan jawaban",
    ],
  },
  {
    clusterId: "kurang_menggali",
    priority: 5,
    label: "Kurang menggali kebutuhan",
    keywords: [
      "tidak bertanya",
      "kurang menggali",
      "berasumsi",
      "terlewat",
      "tidak tuntas",
      "tidak menanyakan",
      "tidak melakukan probing",
      "kemampuan bertanya",
    ],
  },
  {
    clusterId: "komunikasi_layanan",
    priority: 4,
    label: "Komunikasi & etika layanan telepon kurang optimal",
    serviceTypes: ["call"],
    keywords: [
      "kemampuan menyimak",
      "pilihan kata",
      "kualitas suara",
      "kemampuan menjelaskan",
      "patience empathy",
      "salam pembuka",
      "menyapa konsumen",
      "salam penutup",
    ],
  },
];

export const FALLBACK_CLUSTER_ID = "lainnya";

export function buildSearchText(row) {
  const parts = [
    row.ketidaksesuaian,
    row.sebaiknya,
    row.indicator_name || row.indicatorName || "",
  ].filter(Boolean);
  return normalizeText(parts.join(" "));
}

export function matchCluster(searchText, serviceType, excludeClusterId = null) {
  let bestMatch = null;

  for (const entry of ROOT_CAUSE_REGISTRY) {
    if (entry.clusterId === excludeClusterId) continue;
    if (entry.serviceTypes && !entry.serviceTypes.includes(serviceType)) {
      continue;
    }
    const matchedKeywords = entry.keywords.filter((kw) =>
      searchText.includes(normalizeText(kw)),
    );
    if (matchedKeywords.length === 0) continue;

    if (
      !bestMatch ||
      matchedKeywords.length > bestMatch.matchedKeywords.length ||
      (matchedKeywords.length === bestMatch.matchedKeywords.length &&
        entry.priority > bestMatch.entry.priority)
    ) {
      bestMatch = { entry, matchedKeywords };
    }
  }

  if (bestMatch) {
    return {
      clusterId: bestMatch.entry.clusterId,
      label: bestMatch.entry.label,
      matchedKeywords: bestMatch.matchedKeywords,
    };
  }

  return {
    clusterId: FALLBACK_CLUSTER_ID,
    label: "Lainnya",
    matchedKeywords: [],
  };
}
