import { Shield, UserCheck, Layers, Activity, History } from "lucide-react";
import { APP_MODULES } from "../../lib/app-config";

export const SIDAK_CHILDREN = [
  { to: "/sidak", label: "Beranda SIDAK", exactMatch: true },
  { to: "/sidak/dashboard", label: "Dashboard SIDAK" },
  { to: "/sidak/forecast", label: "Forecast" },
  { to: "/sidak/agents", label: "Analisis Individu", startsWith: true },
  { to: "/sidak/ranking", label: "Ranking Agen" },
  {
    to: "/sidak/reports",
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
    label: "User Management",
    icon: Shield,
    capability: "admin.users" as const,
  },
  {
    to: "/dashboard/access-approval",
    label: "Access Approval",
    icon: UserCheck,
    capability: "admin.leaderAccess" as const,
  },
  {
    to: "/dashboard/access-groups",
    label: "Access Groups",
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
    label: "Activity Logs",
    icon: History,
    capability: "admin.activityLogs.read" as const,
  },
];

export const MOBILE_TAB_IDS = [
  "dashboard",
  "ketik",
  "pdkt",
  "telefun",
  "profiler",
  "qa-analyzer",
] as const;

export const MOBILE_TABS = APP_MODULES.filter((module) =>
  MOBILE_TAB_IDS.some((id) => id === module.id),
);

export interface BreadcrumbSegment {
  label: string;
  href?: string; // undefined = current page (no link)
}

export function buildBreadcrumb(pathname: string): BreadcrumbSegment[] {
  const crumbs: BreadcrumbSegment[] = [];

  // Root
  if (pathname === "/dashboard") {
    return [{ label: "Dashboard" }];
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
    if (pathname === "/pdkt/simulation") {
      crumbs.push({ label: "Simulasi" });
      return crumbs;
    }
    return crumbs.map((c, i) =>
      i === crumbs.length - 1 ? { ...c, href: undefined } : c,
    );
  }
  if (pathname.startsWith("/telefun")) {
    crumbs.push({ label: "Telefun", href: "/telefun" });
    if (pathname.startsWith("/telefun/replay")) {
      crumbs.push({ label: "Replay" });
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
      { label: "Dashboard", href: "/dashboard" },
      { label: "Kelola Pengguna" },
    ];
  }
  if (pathname === "/dashboard/access-approval") {
    return [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Persetujuan Akses" },
    ];
  }
  if (pathname === "/dashboard/access-groups") {
    return [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Grup Akses" },
    ];
  }
  if (pathname === "/dashboard/activities") {
    return [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Log Aktivitas" },
    ];
  }

  return [{ label: "Trainers SuperApp" }];
}
