import { normalizeRole, type Capability, type Role } from "@trainers/types";
import {
  Shield,
  UserCheck,
  Layers,
  Activity,
  History,
  type LucideIcon,
} from "lucide-react";
import { APP_MODULES, isCapabilityAllowed } from "../../lib/app-config";

export const SIDAK_CHILDREN = [
  { to: "/sidak", label: "Beranda SIDAK", exactMatch: true },
  { to: "/sidak/dashboard", label: "Dashboard SIDAK" },
  { to: "/sidak/forecast", label: "Forecast" },
  { to: "/sidak/agents", label: "Analisis Individu" },
  { to: "/sidak/ranking", label: "Ranking Agen" },
  {
    to: "/sidak/reports-data",
    label: "Laporan",
    capability: "sidak.reports.view" as const,
  },
  {
    // Volume temuan ketidaksesuaian per hari. Admin/trainer melihat semua;
    // leader hanya scope tim-nya. Nama menu "QA" di dalam halaman bukan
    // berarti role `qa` punya akses.
    to: "/sidak/heatmap",
    label: "Heatmap",
    capability: "sidak.view" as const,
  },
  {
    to: "/sidak/input",
    label: "Input Temuan",
    capability: "sidak.config.manage" as const,
  },
  {
    to: "/sidak/periods",
    label: "Periode QA",
    capability: "sidak.config.manage" as const,
  },
  {
    // Read-only jadwal WFM. Role dibatasi admin+trainer di tiga lapis: nav ini,
    // route guard, dan `requireCapability` di backend. Leader/agent tidak termasuk —
    // jangan menambah role lain tanpa persetujuan Fajar.
    to: "/sidak/jadwal-shifting",
    label: "Jadwal Shifting",
    capability: "sidak.schedule.read" as const,
  },
  {
    to: "/sidak/settings",
    label: "Parameter QA",
    capability: "sidak.config.manage" as const,
  },
];

export const MANAGEMENT_LINKS = [
  {
    to: "/dashboard/users",
    label: "Pengguna",
    icon: Shield,
    capability: "admin.users" as const,
  },
  {
    to: "/dashboard/access-approval",
    label: "Persetujuan Akses",
    icon: UserCheck,
    capability: "admin.leaderAccess" as const,
  },
  {
    to: "/dashboard/access-groups",
    label: "Grup Akses",
    icon: Layers,
    capability: "admin.accessGroups" as const,
  },
  {
    to: "/monitoring",
    label: "Monitoring",
    icon: Activity,
    capability: "monitoring.read" as const,
  },
  {
    to: "/dashboard/activities",
    label: "Log Aktivitas",
    icon: History,
    capability: "admin.activityLogs.read" as const,
  },
];

export type NavGroupId =
  | "beranda"
  | "latihan"
  | "kualitas"
  | "data"
  | "administrasi";

export interface NavChild {
  to: string;
  label: string;
  exactMatch?: boolean;
}

export interface NavItem {
  /** `APP_MODULES.id` untuk modul; path untuk tautan Administrasi. */
  id: string;
  label: string;
  description?: string;
  href: string;
  icon: LucideIcon;
  /** Token warna modul (`var(--module-*)`); kosong untuk Beranda/Administrasi. */
  moduleColor?: string;
  /** Sub-halaman yang lolos capability peran (SIDAK). */
  children?: NavChild[];
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  items: NavItem[];
}

export interface NavModel {
  /** Urutan tampil sidebar dan drawer. Grup kosong tidak disertakan. */
  groups: NavGroup[];
  /** Tab utama ponsel (tanpa "Lainnya"). */
  mobileTabs: NavItem[];
}

const MODULE_GROUPS: { id: NavGroupId; label: string }[] = [
  { id: "beranda", label: "Beranda" },
  { id: "latihan", label: "Latihan" },
  { id: "kualitas", label: "Kualitas" },
  { id: "data", label: "Data" },
];

/** Urutan modul di dalam grupnya; modul yang tidak tercantum menyusul. */
const MODULE_ORDER = [
  "dashboard",
  "ketik",
  "pdkt",
  "telefun",
  "qa-analyzer",
  "tna",
  "profiler",
];

const MODULE_COLORS: Record<string, string> = {
  ketik: "var(--module-ketik)",
  pdkt: "var(--module-pdkt)",
  telefun: "var(--module-telefun)",
  "qa-analyzer": "var(--module-sidak)",
  tna: "var(--module-tna)",
  profiler: "var(--module-profiler)",
};

/**
 * Tab utama ponsel per peran. Modul yang tidak diizinkan tetap tersaring oleh
 * capability, jadi daftar ini tidak memberi akses apa pun.
 */
const MOBILE_TAB_IDS: Record<Role, readonly string[]> = {
  admin: ["dashboard", "qa-analyzer", "tna", "ketik"],
  trainer: ["dashboard", "qa-analyzer", "tna", "ketik"],
  leader: ["dashboard", "qa-analyzer", "profiler", "ketik"],
  agent: ["dashboard", "ketik", "pdkt"],
};

/**
 * Satu-satunya sumber navigasi shell. Sidebar, drawer, tab bar, dan Beranda
 * membaca model ini; jangan membuat daftar modul lokal di komponen.
 */
export function buildNavModel(role: string | null | undefined): NavModel {
  const allowed = (capability?: Capability) =>
    isCapabilityAllowed(role, capability);

  const allowedModules = APP_MODULES.filter((module) =>
    allowed(module.capability),
  ).sort((a, b) => orderIndex(a.id) - orderIndex(b.id));

  const toItem = (module: (typeof APP_MODULES)[number]): NavItem => ({
    id: module.id,
    label: module.navLabel ?? module.shortTitle,
    description: module.navDescription,
    href: module.href,
    icon: module.icon,
    moduleColor: MODULE_COLORS[module.id],
    children:
      module.id === "qa-analyzer"
        ? SIDAK_CHILDREN.filter((child) => allowed(child.capability)).map(
            ({ to, label, exactMatch }) => ({ to, label, exactMatch }),
          )
        : undefined,
  });

  const groups: NavGroup[] = MODULE_GROUPS.map(({ id, label }) => ({
    id,
    label,
    items: allowedModules
      .filter((module) => (module.group ?? "beranda") === id)
      .map(toItem),
  }));
  groups.push({
    id: "administrasi",
    label: "Administrasi",
    items: MANAGEMENT_LINKS.filter((link) => allowed(link.capability)).map(
      (link) => ({
        id: link.to,
        label: link.label,
        href: link.to,
        icon: link.icon,
      }),
    ),
  });

  const moduleItems = groups.flatMap((group) => group.items);
  const normalizedRole = normalizeRole(role);
  const tabIds = normalizedRole ? MOBILE_TAB_IDS[normalizedRole] : [];

  return {
    groups: groups.filter((group) => group.items.length > 0),
    mobileTabs: tabIds.flatMap(
      (id) => moduleItems.find((item) => item.id === id) ?? [],
    ),
  };
}

function orderIndex(id: string) {
  const index = MODULE_ORDER.indexOf(id);
  return index === -1 ? MODULE_ORDER.length : index;
}

export interface BreadcrumbSegment {
  label: string;
  href?: string; // undefined = current page (no link)
}

export function buildBreadcrumb(pathname: string): BreadcrumbSegment[] {
  const crumbs: BreadcrumbSegment[] = [];

  // Root
  if (pathname === "/dashboard") {
    return [{ label: "Beranda" }];
  }

  if (pathname === "/tna") return [{ label: "TNA" }];
  if (pathname.startsWith("/tna/")) {
    const label =
      pathname === "/tna/parameter"
        ? "Detail parameter"
        : pathname.startsWith("/tna/kebutuhan/")
          ? "Kebutuhan"
          : "Rencana";
    return [{ label: "TNA", href: "/tna" }, { label }];
  }

  // Module root detection
  if (pathname.startsWith("/sidak")) {
    crumbs.push({ label: "SIDAK", href: "/sidak" });
    if (pathname === "/sidak")
      return crumbs.map((c, i) =>
        i === crumbs.length - 1 ? { ...c, href: undefined } : c,
      );
    if (pathname === "/sidak/dashboard") {
      crumbs.push({ label: "Dashboard SIDAK" });
      return crumbs;
    }
    if (pathname === "/sidak/forecast") {
      crumbs.push({ label: "Forecast" });
      return crumbs;
    }
    if (pathname === "/sidak/input") {
      crumbs.push({ label: "Input Temuan" });
      return crumbs;
    }
    if (pathname === "/sidak/ranking") {
      crumbs.push({ label: "Ranking" });
      return crumbs;
    }
    if (pathname === "/sidak/settings") {
      crumbs.push({ label: "Parameter" });
      return crumbs;
    }
    if (pathname === "/sidak/periods") {
      crumbs.push({ label: "Periode" });
      return crumbs;
    }
    if (pathname === "/sidak/jadwal-shifting") {
      crumbs.push({ label: "Jadwal Shifting" });
      return crumbs;
    }
    if (pathname.startsWith("/sidak/agents/")) {
      crumbs.push({ label: "Agen", href: "/sidak/agents" });
      crumbs.push({ label: "Detail" });
      return crumbs;
    }
    if (pathname === "/sidak/agents") {
      crumbs.push({ label: "Analisis Individu" });
      return crumbs;
    }
    if (pathname.startsWith("/sidak/reports")) {
      crumbs.push({ label: "Laporan" });
      return crumbs;
    }
    crumbs.push({ label: pathname.split("/").pop() || "" });
    return crumbs;
  }

  if (pathname.startsWith("/ketik")) {
    return [{ label: "KETIK" }];
  }
  if (pathname.startsWith("/pdkt")) {
    crumbs.push({ label: "PDKT", href: "/pdkt" });
    if (pathname === "/pdkt/history") {
      crumbs.push({ label: "Riwayat" });
      return crumbs;
    }
    return crumbs.map((c, i) =>
      i === crumbs.length - 1 ? { ...c, href: undefined } : c,
    );
  }
  if (pathname.startsWith("/telefun")) {
    crumbs.push({ label: "Telefun", href: "/telefun" });
    if (pathname === "/telefun/history") {
      crumbs.push({ label: "Riwayat" });
      return crumbs;
    }
    return crumbs.map((c, i) =>
      i === crumbs.length - 1 ? { ...c, href: undefined } : c,
    );
  }
  if (pathname.startsWith("/profiler")) {
    crumbs.push({ label: "KTP", href: "/profiler" });
    if (pathname === "/profiler/table") {
      crumbs.push({ label: "Tabel" });
      return crumbs;
    }
    if (pathname === "/profiler/add") {
      crumbs.push({ label: "Tambah" });
      return crumbs;
    }
    if (pathname === "/profiler/import") {
      crumbs.push({ label: "Import" });
      return crumbs;
    }
    if (pathname === "/profiler/teams") {
      crumbs.push({ label: "Tim" });
      return crumbs;
    }
    return crumbs.map((c, i) =>
      i === crumbs.length - 1 ? { ...c, href: undefined } : c,
    );
  }
  if (pathname === "/monitoring") {
    return [{ label: "Monitoring" }];
  }
  if (pathname === "/account") {
    return [{ label: "Akun" }];
  }

  // Dashboard management
  if (pathname === "/dashboard/users") {
    return [
      { label: "Beranda", href: "/dashboard" },
      { label: "Pengguna" },
    ];
  }
  if (pathname === "/dashboard/access-approval") {
    return [
      { label: "Beranda", href: "/dashboard" },
      { label: "Persetujuan Akses" },
    ];
  }
  if (pathname === "/dashboard/access-groups") {
    return [
      { label: "Beranda", href: "/dashboard" },
      { label: "Grup Akses" },
    ];
  }
  if (pathname === "/dashboard/activities") {
    return [
      { label: "Beranda", href: "/dashboard" },
      { label: "Log Aktivitas" },
    ];
  }

  return [{ label: "Trainers SuperApp" }];
}
