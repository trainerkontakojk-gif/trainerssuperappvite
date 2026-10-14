import { Link } from "@tanstack/react-router";
import type { Capability } from "@trainers/types";
import {
  ArrowRight,
  ChartLine,
  ClipboardList,
  Grid3x3,
  Plus,
  Trophy,
  UserSearch,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { isCapabilityAllowed } from "../../../lib/app-config";

const SHORTCUTS: {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  color: string;
  capability: Capability;
}[] = [
  {
    label: "Input temuan",
    description: "Catat hasil audit QA",
    href: "/sidak/input",
    icon: Plus,
    color: "var(--module-sidak)",
    capability: "sidak.config.manage",
  },
  {
    label: "Analisis individu",
    description: "Rapor performa per agen",
    href: "/sidak/agents",
    icon: UserSearch,
    color: "var(--module-sidak)",
    capability: "sidak.read",
  },
  {
    label: "Ranking agen",
    description: "Peringkat skor agen",
    href: "/sidak/ranking",
    icon: Trophy,
    color: "var(--module-sidak)",
    capability: "sidak.read",
  },
  {
    label: "Forecast",
    description: "Proyeksi temuan per layanan",
    href: "/sidak/forecast",
    icon: ChartLine,
    color: "var(--module-sidak)",
    capability: "sidak.read",
  },
  {
    label: "Rencana TNA",
    description: "Susun rencana pelatihan",
    href: "/tna",
    icon: ClipboardList,
    color: "var(--module-tna)",
    capability: "tna.read",
  },
  {
    label: "Heatmap",
    description: "Sebaran temuan per hari",
    href: "/sidak/heatmap",
    icon: Grid3x3,
    color: "var(--module-sidak)",
    capability: "sidak.view",
  },
  {
    label: "Profil tim",
    description: "Data agen di KTP",
    href: "/profiler",
    icon: Users,
    color: "var(--module-profiler)",
    capability: "profiler.landing",
  },
];

/** Lima tujuan kerja yang paling sering dipakai peran ini. */
export function Shortcuts({ role }: { role: string | null | undefined }) {
  const items = SHORTCUTS.filter((item) =>
    isCapabilityAllowed(role, item.capability),
  ).slice(0, 5);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="home-shortcuts-title" className="home-section">
      <div className="home-section-head home-section-head-row">
        <h2 id="home-shortcuts-title" className="home-section-title">
          Pintasan
        </h2>
      </div>
      <ul className="home-rows">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              to={item.href as any}
              className="home-shortcut"
              style={{ "--mc": item.color } as CSSProperties}
            >
              <item.icon className="home-shortcut-icon" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-fg">
                  {item.label}
                </span>
                <span className="block text-[12px] text-fg2">
                  {item.description}
                </span>
              </span>
              <ArrowRight className="home-shortcut-arrow" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
