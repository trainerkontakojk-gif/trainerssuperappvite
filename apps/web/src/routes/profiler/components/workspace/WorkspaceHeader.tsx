import React from "react";
import { ChevronRight, Moon, PanelRight, Sun } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useThemeMode } from "../../../../hooks/useThemeMode";

interface WorkspaceHeaderProps {
  onToggleSidebar?: () => void;
  activeBatch?: string;
  activeTeam?: string;
  activeYearLabel?: string;
}

export default function WorkspaceHeader({
  onToggleSidebar,
  activeBatch,
  activeTeam,
  activeYearLabel,
}: WorkspaceHeaderProps) {
  const { theme, setTheme } = useThemeMode();

  return (
    <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-4 border-b border-border bg-background px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            KTP / Profiler
          </span>
          <span className="truncate font-outfit text-sm font-semibold tracking-tight text-foreground">
            Kotak Tool Profile
          </span>
        </div>

        <Separator orientation="vertical" className="hidden h-7 sm:block" />

        <nav
          aria-label="Lokasi workspace"
          className="hidden min-w-0 items-center gap-2 text-xs md:flex"
        >
          {activeYearLabel && (
            <span className="shrink-0 text-muted-foreground">
              {activeYearLabel}
            </span>
          )}
          {activeTeam && (
            <ChevronRight
              aria-hidden="true"
              className="size-3 text-muted-foreground"
            />
          )}
          {activeTeam && (
            <span className="max-w-40 truncate text-muted-foreground">
              {activeTeam}
            </span>
          )}
          {activeBatch && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-52 truncate font-medium text-foreground"
            >
              {activeBatch}
            </motion.span>
          )}
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={
            theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"
          }
          title={
            theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"
          }
          className="min-h-11 min-w-11"
        >
          {theme === "dark" ? (
            <Sun aria-hidden="true" />
          ) : (
            <Moon aria-hidden="true" />
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={onToggleSidebar}
          aria-label="Buka navigasi hierarki"
          title="Buka navigasi hierarki"
          className="min-h-11 min-w-11 md:hidden"
        >
          <PanelRight aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
