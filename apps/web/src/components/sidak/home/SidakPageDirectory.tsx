import { Link } from "@tanstack/react-router";
import type { NavChild, SidakPageGroup } from "../../layout/nav-config";
import { SidakHomeSection } from "./SidakHomeSection";

const GROUPS: { id: SidakPageGroup; label: string }[] = [
  { id: "audit", label: "Audit" },
  { id: "analisis", label: "Analisis" },
  { id: "agen", label: "Agen" },
  { id: "laporan", label: "Laporan" },
];

/**
 * Daftar sub-halaman SIDAK, dikelompokkan menurut pekerjaan. Isinya dari model
 * navigasi (`buildNavModel`), jadi capability peran yang sama dengan sidebar
 * berlaku di sini.
 */
export function SidakPageDirectory({ pages }: { pages: NavChild[] }) {
  const groups = GROUPS.map((group) => ({
    ...group,
    pages: pages.filter((page) => page.group === group.id),
  })).filter((group) => group.pages.length > 0);

  return (
    <SidakHomeSection id="sidak-home-pages" title="Halaman SIDAK">
      <div className="grid overflow-hidden rounded-xl border border-border bg-border gap-px sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((group) => (
          <div
            key={group.id}
            className="flex min-w-0 flex-col gap-1 bg-surface-elevated p-4"
          >
            <h3 className="text-sm font-semibold text-fg2">{group.label}</h3>
            <ul className="flex flex-col">
              {group.pages.map((page) => (
                <li key={page.to}>
                  <Link
                    to={page.to}
                    className="group -mx-2 flex min-h-[44px] flex-col justify-center gap-0.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                  >
                    <span className="font-semibold text-foreground">
                      {page.label}
                    </span>
                    {page.description ? (
                      <span className="text-sm text-fg2">
                        {page.description}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SidakHomeSection>
  );
}
