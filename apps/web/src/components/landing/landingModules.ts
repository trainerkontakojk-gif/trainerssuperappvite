import type { CSSProperties } from "react";

export type LandingModuleId =
  "ketik" | "pdkt" | "telefun" | "ktp" | "sidak" | "tna";

export type LandingModule = {
  id: LandingModuleId;
  code: string;
  fullName: string;
  use: string;
  description: string;
};

/** Public landing copy for the six modules, in workflow order. */
export const LANDING_MODULES: readonly LandingModule[] = [
  {
    id: "ketik",
    code: "KETIK",
    fullName: "Kelas Etika & Trik Komunikasi",
    use: "Simulasi chat",
    description:
      "Simulasi chat dengan skenario konsumen. Latih tanggapan tertulis yang empatik dan solutif, lalu tinjau umpan baliknya.",
  },
  {
    id: "pdkt",
    code: "PDKT",
    fullName: "Paham Dulu Kasih Tanggapan",
    use: "Simulasi email",
    description:
      "Mailbox simulasi untuk korespondensi email: susun draf, kirim tanggapan, dan evaluasi hasilnya.",
  },
  {
    id: "telefun",
    code: "TELEFUN",
    fullName: "Telephone Fun",
    use: "Simulasi telepon",
    description:
      "Simulasi percakapan telepon berbasis suara. Asah alur percakapan dan cara merespons konsumen secara langsung.",
  },
  {
    id: "ktp",
    code: "KTP",
    fullName: "Kotak Tool Profil",
    use: "Profil peserta",
    description:
      "Kelola profil agen, peserta, dan tim — impor, ekspor, dan data yang siap dipakai untuk pelatihan.",
  },
  {
    id: "sidak",
    code: "SIDAK",
    fullName: "Sistem Informasi Data Analisis Kualitas",
    use: "Analisis kualitas",
    description:
      "Input audit, skor, ranking, dan pola temuan kualitas untuk menemukan area perbaikan lintas tim.",
  },
  {
    id: "tna",
    code: "TNA",
    fullName: "Training Needs Analysis",
    use: "Kebutuhan pelatihan",
    description:
      "Validasi temuan kualitas, lalu susun kebutuhan dan rencana pelatihan. Tersedia untuk admin dan trainer.",
  },
];

/** `--channel` drives every module-coloured accent in landing.css. */
export const channelStyle = (id: LandingModuleId) =>
  ({ "--channel": `var(--${id})` }) as CSSProperties;

/** Sets arbitrary CSS custom properties used by the stage animations. */
export const cssVars = (vars: Record<string, string>) => vars as CSSProperties;
