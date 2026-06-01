export const LICENSED_COMPANY_NAMES: Record<string, string[]> = {
  Perbankan: [
    "Bank Central Asia (BCA)",
    "Bank Mandiri",
    "Bank Rakyat Indonesia (BRI)",
    "Bank Negara Indonesia (BNI)",
    "Bank Tabungan Negara (BTN)",
    "Bank CIMB Niaga",
    "Bank Danamon Indonesia",
    "Bank Permata",
    "Bank Maybank Indonesia",
    "Bank Panin",
    "Bank OCBC NISP",
    "Bank Syariah Indonesia (BSI)",
    "Bank Mega",
    "Bank UOB Indonesia",
    "Bank Sinarmas",
  ],
  Asuransi: [
    "Prudential Indonesia",
    "Allianz Life Indonesia",
    "AXA Mandiri Financial Services",
    "Manulife Indonesia",
    "AIA Financial",
    "BNI Life Insurance",
    "BRI Life",
    "Sinarmas MSIG Life",
    "Sequis Life",
    "FWD Insurance Indonesia",
    "Great Eastern Life Indonesia",
    "Sun Life Financial Indonesia",
  ],
};

export const UNLICENSED_COMPANY_NAMES: Record<string, string[]> = {
  Pinjol: ["Dana Cepat 88", "Pinjaman Kilat Nusantara", "Kredit Mudah Jaya"],
  Penipuan: ["Hadiah Berkah Digital", "Promo Untung Nasional", "Dana Reward Center"],
  Investasi: ["Investasi Cuan Jaya", "Mitra Profit Nusantara", "Aset Tumbuh Mandiri"],
  default: ["Dana Cepat 88", "Mitra Finansia Nusantara", "Layanan Dana Mandiri"],
};

export const SCENARIO_COMPANY_CATEGORY_MAP: Record<string, string> = {
  "Pengecekan SLIK": "Perbankan",
  "Tagihan Kartu Kredit": "Perbankan",
  "Klaim Asuransi Ditolak": "Asuransi",
};
