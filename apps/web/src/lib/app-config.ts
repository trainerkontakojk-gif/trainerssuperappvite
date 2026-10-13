import { can, normalizeRole, type Capability } from "@trainers/types";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Phone,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface AppModuleConfig {
  id: string;
  title: string;
  shortTitle: string;
  expandedTitle: string;
  description: string;
  href: string;
  icon: LucideIcon;
  accentClassName: string;
  accentSoftClassName: string;
  capability?: Capability;
  /** Label navigasi shell (sidebar, drawer, tab bar). Default: `shortTitle`. */
  navLabel?: string;
  /** Fungsi singkat di bawah label navigasi. */
  navDescription?: string;
  /** Grup navigasi shell; lihat `buildNavModel` di `nav-config.ts`. */
  group?: "beranda" | "latihan" | "kualitas" | "data";
}

export const APP_MODULES: AppModuleConfig[] = [
  {
    id: "dashboard",
    navLabel: "Beranda",
    navDescription: "Ringkasan & tindakan",
    group: "beranda",
    title: "Unified Dashboard",
    shortTitle: "Dashboard",
    expandedTitle: "Unified Dashboard",
    description:
      "Pusat kendali untuk memantau performa, aktivitas, dan prioritas kerja harian.",
    href: "/dashboard",
    icon: LayoutDashboard,
    accentClassName: "text-indigo-600",
    accentSoftClassName: "bg-indigo-100",
  },
  {
    id: "ketik",
    navLabel: "KETIK",
    navDescription: "Simulasi chat",
    group: "latihan",
    title: "KETIK",
    shortTitle: "Ketik",
    expandedTitle: "Kelas Etika & Trik Komunikasi",
    description:
      "Simulasi chat layanan untuk melatih komunikasi tertulis yang empatik dan solutif.",
    href: "/ketik",
    icon: MessageSquare,
    accentClassName: "text-emerald-600",
    accentSoftClassName: "bg-emerald-100",
  },
  {
    id: "pdkt",
    navLabel: "PDKT",
    navDescription: "Simulasi email",
    group: "latihan",
    title: "PDKT",
    shortTitle: "PDKT",
    expandedTitle: "Paham Dulu Kasih Tanggapan",
    description:
      "Workspace korespondensi email untuk standardisasi tanggapan layanan konsumen.",
    href: "/pdkt",
    icon: Mail,
    accentClassName: "text-sky-600",
    accentSoftClassName: "bg-sky-100",
    capability: "pdkt.use",
  },
  {
    id: "telefun",
    navLabel: "TELEFUN",
    navDescription: "Simulasi telepon",
    group: "latihan",
    title: "TELEFUN",
    shortTitle: "Telefun",
    expandedTitle: "Telephone Fun",
    description:
      "Simulasi komunikasi suara untuk melatih percakapan telepon yang presisi dan profesional.",
    href: "/telefun",
    icon: Phone,
    accentClassName: "text-violet-600",
    accentSoftClassName: "bg-violet-100",
    capability: "telefun.use",
  },
  {
    id: "profiler",
    navLabel: "KTP",
    navDescription: "Profil agen & peserta",
    group: "data",
    title: "KTP / Profiler",
    shortTitle: "KTP",
    expandedTitle: "Kotak Tool Profil",
    description:
      "Database profil agen dan peserta untuk operasional training yang lebih rapi dan terstruktur.",
    href: "/profiler",
    icon: Users,
    accentClassName: "text-amber-600",
    accentSoftClassName: "bg-amber-100",
    capability: "profiler.landing",
  },
  {
    id: "qa-analyzer",
    navLabel: "SIDAK",
    navDescription: "Analitik kualitas QA",
    group: "kualitas",
    title: "SIDAK",
    shortTitle: "SIDAK",
    expandedTitle: "Sistem Informasi Data Analisis Kualitas",
    description:
      "Analytics kualitas untuk membaca pola temuan, ranking, dan area perbaikan lintas tim.",
    href: "/sidak",
    icon: BarChart3,
    accentClassName: "text-rose-600",
    accentSoftClassName: "bg-rose-100",
    capability: "sidak.landing",
  },
  {
    id: "tna",
    navLabel: "TNA",
    navDescription: "Kebutuhan pelatihan",
    group: "kualitas",
    title: "TNA",
    shortTitle: "TNA",
    expandedTitle: "Training Needs Analysis",
    description: "Deteksi, validasi kebutuhan, dan rencana pelatihan.",
    href: "/tna",
    icon: ClipboardList,
    capability: "tna.read",
    accentClassName: "text-module-tna",
    accentSoftClassName: "bg-[var(--module-tna-bg)]",
  },
];

export function normalizeRoleLabel(raw?: string | null) {
  const role = normalizeRole(raw);
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : "User";
}

export function isCapabilityAllowed(
  role: string | undefined | null,
  capability: Capability = "dashboard.view",
) {
  return can(normalizeRole(role), capability);
}
