import {
  Shield,
  UserCheck,
  Layers,
  Activity,
  History,
} from "lucide-react";
import { APP_MODULES } from "../../lib/app-config";

export const SIDAK_CHILDREN = [
  { to: "/sidak", label: "Beranda SIDAK", exactMatch: true },
  { to: "/sidak/dashboard", label: "Dashboard QA" },
  { to: "/sidak/agents", label: "Analisis Individu", startsWith: true },
  { to: "/sidak/ranking", label: "Ranking Agen" },
  {
    to: "/sidak/reports",
    label: "Laporan",
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/sidak/input",
    label: "Input Temuan",
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/sidak/periods",
    label: "Periode QA",
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/sidak/settings",
    label: "Parameter QA",
    allowedRoles: ["trainer", "admin"],
  },
];

export const MANAGEMENT_LINKS = [
  {
    to: "/dashboard/users",
    label: "User Management",
    icon: Shield,
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/dashboard/access-approval",
    label: "Access Approval",
    icon: UserCheck,
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/dashboard/access-groups",
    label: "Access Groups",
    icon: Layers,
    allowedRoles: ["trainer", "admin"],
  },
  {
    to: "/monitoring",
    label: "Monitoring",
    icon: Activity,
    allowedRoles: ["trainer", "leader", "admin"],
  },
  {
    to: "/dashboard/activities",
    label: "Activity Logs",
    icon: History,
    allowedRoles: ["trainer", "admin"],
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
  href?: string;  // undefined = current page (no link)
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
    if (pathname === "/sidak") return crumbs.map((c, i) => i === crumbs.length-1 ? {...c, href: undefined} : c);
    if (pathname === "/sidak/dashboard") { crumbs.push({ label: "Dashboard QA" }); return crumbs; }
    if (pathname === "/sidak/input") { crumbs.push({ label: "Input Temuan" }); return crumbs; }
    if (pathname === "/sidak/ranking") { crumbs.push({ label: "Ranking" }); return crumbs; }
    if (pathname === "/sidak/settings") { crumbs.push({ label: "Parameter" }); return crumbs; }
    if (pathname === "/sidak/periods") { crumbs.push({ label: "Periode" }); return crumbs; }
    if (pathname.startsWith("/sidak/agents/")) { crumbs.push({ label: "Agen", href: "/sidak/agents" }); crumbs.push({ label: "Detail" }); return crumbs; }
    if (pathname === "/sidak/agents") { crumbs.push({ label: "Analisis Individu" }); return crumbs; }
    if (pathname.startsWith("/sidak/reports")) { crumbs.push({ label: "Laporan" }); return crumbs; }
    crumbs.push({ label: pathname.split("/").pop() || "" });
    return crumbs;
  }

  if (pathname.startsWith("/ketik")) { return [{ label: "KETIK" }]; }
  if (pathname.startsWith("/pdkt")) {
    crumbs.push({ label: "PDKT", href: "/pdkt" });
    if (pathname === "/pdkt/simulation") { crumbs.push({ label: "Simulasi" }); return crumbs; }
    return crumbs.map((c, i) => i === crumbs.length-1 ? {...c, href: undefined} : c);
  }
  if (pathname.startsWith("/telefun")) {
    crumbs.push({ label: "Telefun", href: "/telefun" });
    if (pathname.startsWith("/telefun/replay")) { crumbs.push({ label: "Replay" }); return crumbs; }
    return crumbs.map((c, i) => i === crumbs.length-1 ? {...c, href: undefined} : c);
  }
  if (pathname.startsWith("/profiler")) {
    crumbs.push({ label: "KTP", href: "/profiler" });
    if (pathname === "/profiler/table") { crumbs.push({ label: "Tabel" }); return crumbs; }
    if (pathname === "/profiler/analytics") { crumbs.push({ label: "Analitik" }); return crumbs; }
    if (pathname === "/profiler/slides") { crumbs.push({ label: "Slides" }); return crumbs; }
    if (pathname === "/profiler/export") { crumbs.push({ label: "Export" }); return crumbs; }
    if (pathname === "/profiler/add") { crumbs.push({ label: "Tambah" }); return crumbs; }
    if (pathname === "/profiler/import") { crumbs.push({ label: "Import" }); return crumbs; }
    if (pathname === "/profiler/teams") { crumbs.push({ label: "Tim" }); return crumbs; }
    return crumbs.map((c, i) => i === crumbs.length-1 ? {...c, href: undefined} : c);
  }
  if (pathname === "/monitoring") { return [{ label: "Monitoring" }]; }
  if (pathname === "/account") { return [{ label: "Akun" }]; }

  // Dashboard management
  if (pathname === "/dashboard/users") { return [{ label: "Dashboard", href: "/dashboard" }, { label: "Kelola Pengguna" }]; }
  if (pathname === "/dashboard/access-approval") { return [{ label: "Dashboard", href: "/dashboard" }, { label: "Persetujuan Akses" }]; }
  if (pathname === "/dashboard/access-groups") { return [{ label: "Dashboard", href: "/dashboard" }, { label: "Grup Akses" }]; }
  if (pathname === "/dashboard/activities") { return [{ label: "Dashboard", href: "/dashboard" }, { label: "Log Aktivitas" }]; }

  return [{ label: "Trainers SuperApp" }];
}
