import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { buildNavModel } from "./nav-config";
import { NavList } from "./NavList";
import { UserMenu } from "./UserMenu";
import type { ThemeMode } from "../../hooks/useThemeMode";

const COLLAPSED_KEY = "trainers.sidebar.collapsed";

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, String(value));
  } catch {
    // Penyimpanan diblokir: pilihan hanya berlaku sampai reload.
  }
}

interface SidebarProps {
  pathname: string;
  profile: any;
  session: any;
  hasTelefunAccess: boolean;
  openMaintenance: () => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  handleLogout: () => void;
}

/** Sidebar berlabel (≥1024px) yang bisa diciutkan menjadi rail. */
export function Sidebar({
  pathname,
  profile,
  session,
  hasTelefunAccess,
  openMaintenance,
  theme,
  setTheme,
  handleLogout,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const model = buildNavModel(profile?.role);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
  };

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside className="app-sidebar hidden lg:flex" data-collapsed={collapsed}>
      <div className="app-sidebar-top">
        <Link to="/dashboard" className="app-sidebar-wordmark">
          Trainers <span>SuperApp</span>
        </Link>
        <button
          type="button"
          className="app-sidebar-icon-btn"
          aria-label={collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}
          onClick={toggle}
        >
          <ToggleIcon className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Navigasi utama" className="app-sidebar-nav">
        <NavList
          model={model}
          pathname={pathname}
          idPrefix="sidebar"
          collapsed={collapsed}
          hasTelefunAccess={hasTelefunAccess}
          openMaintenance={openMaintenance}
        />
      </nav>

      <div className="app-sidebar-foot">
        <UserMenu
          profile={profile}
          session={session}
          theme={theme}
          setTheme={setTheme}
          handleLogout={handleLogout}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}
