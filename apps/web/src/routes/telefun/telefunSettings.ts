export type TelefunAppSettings = {
  selectedModel: string;
  voiceName: string;
  systemInstruction: string;
  consumerName: string;
  consumerGender: string;
  scenarioTitle?: string;
};

export const VOICE_MODELS = [
  { id: 'gemini-3.1-flash-live-preview', name: 'Gemini 3.1 Flash Live (Preview)' },
  { id: 'gemini-3.0-flash-live-preview', name: 'Gemini 3.0 Flash Live (Preview)' },
];

export const VOICE_OPTIONS = [
  { id: 'Kore', name: 'Kore' },
  { id: 'Puck', name: 'Puck' },
  { id: 'Charon', name: 'Charon' },
  { id: 'Aoede', name: 'Aoede' },
  { id: 'Fenrir', name: 'Fenrir' },
  { id: 'Leda', name: 'Leda' },
  { id: 'Orus', name: 'Orus' },
];

export const CONSUMER_GENDERS = [
  { id: 'male', name: 'Laki-laki' },
  { id: 'female', name: 'Perempuan' },
];

export const DEFAULT_TELEFUN_SETTINGS: TelefunAppSettings = {
  selectedModel: 'gemini-3.1-flash-live-preview',
  voiceName: 'Kore',
  systemInstruction: 'Anda adalah konsumen yang menghubungi OJK. Bantu agen melatih kemampuan komunikasi.',
  consumerName: 'Budi Santoso',
  consumerGender: 'male',
};

export const SCENARIO_PRESETS = [
  {
    title: 'Pengaduan Pinjol Ilegal',
    instruction: 'Anda adalah konsumen yang menjadi korban pinjaman online ilegal. Anda merasa dirugikan dan ingin melaporkan ke OJK. Anda kesal karena diancam debt collector dan bunga membengkak.',
  },
  {
    title: 'Laporan Investasi Bodong',
    instruction: 'Anda adalah konsumen yang tertipu investasi bodong berkedok forex. Anda kehilangan Rp50 juta dan ingin melaporkan ke OJK. Anda panik dan ingin tahu langkah hukum.',
  },
  {
    title: 'Klaim Asuransi Ditolak',
    instruction: 'Anda adalah nasabah asuransi yang klaimnya ditolak dengan alasan tidak jelas. Anda sudah memiliki polis selama 3 tahun dan merasa kecewa. Anda ingin mengadu ke OJK.',
  },
  {
    title: 'Layanan Customer Service Bank',
    instruction: 'Anda adalah nasabah bank yang kartu ATM-nya ditelan mesin dan tidak mendapat bantuan dari CS. Anda frustrasi dan ingin melaporkan bank ke OJK.',
  },
  {
    title: 'Konsultasi Produk Keuangan',
    instruction: 'Anda adalah konsumen awam yang ingin bertanya tentang produk keuangan syariah. Anda ramah namun bingung dengan istilah-istilah perbankan.',
  },
];
