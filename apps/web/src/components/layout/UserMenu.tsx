import { useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut, Moon, Sun, UserCog } from "lucide-react";
import { normalizeRoleLabel } from "../../lib/app-config";
import type { ThemeMode } from "../../hooks/useThemeMode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const ITEM_CLASS = "min-h-[44px] gap-2.5 px-2.5 text-[13px]";

interface UserMenuProps {
  profile: { full_name?: string | null; role?: string | null } | null;
  session: { user?: { email?: string | null } } | null;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  handleLogout: () => void;
  /** Rail: hanya avatar yang tampil; nama tetap ada di label tombol. */
  collapsed?: boolean;
  /** Kelas lapisan popup, mis. agar tampil di atas drawer. */
  layerClassName?: string;
  onNavigate?: () => void;
}

/**
 * Menu akun di kaki sidebar dan drawer: Pengaturan akun, Ganti tema, Keluar.
 * Navigasi panah dan Esc (fokus kembali ke pemicu) dari Base UI Menu.
 */
export function UserMenu({
  profile,
  session,
  theme,
  setTheme,
  handleLogout,
  collapsed = false,
  layerClassName,
  onNavigate,
}: UserMenuProps) {
  const navigate = useNavigate();
  const name = profile?.full_name || session?.user?.email || "Pengguna";
  const roleLabel = normalizeRoleLabel(profile?.role);
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="user-menu-trigger"
        aria-label={`${name}, ${roleLabel}, menu akun`}
      >
        <span className="user-avatar" aria-hidden="true">
          {name.charAt(0).toUpperCase()}
        </span>
        {!collapsed && (
          <>
            <span className="nav-label" aria-hidden="true">
              <span className="nav-name">{name}</span>
              <span className="nav-sub">{roleLabel}</span>
            </span>
            <ChevronsUpDown className="nav-chevron" aria-hidden="true" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-56 p-1.5"
        positionerClassName={layerClassName}
      >
        <DropdownMenuItem
          className={ITEM_CLASS}
          onClick={() => {
            onNavigate?.();
            navigate({ to: "/account" });
          }}
        >
          <UserCog aria-hidden="true" />
          Pengaturan akun
        </DropdownMenuItem>
        <DropdownMenuItem
          className={ITEM_CLASS}
          closeOnClick={false}
          onClick={() => setTheme(nextTheme)}
        >
          {nextTheme === "dark" ? (
            <Moon aria-hidden="true" />
          ) : (
            <Sun aria-hidden="true" />
          )}
          Ganti ke tema {nextTheme === "dark" ? "gelap" : "terang"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Teks memakai --fg: --destructive tidak mencapai 4.5:1 sebagai teks
            kecil di kedua tema; ikon merah cukup memenuhi 3:1. */}
        <DropdownMenuItem
          className={ITEM_CLASS}
          onClick={() => {
            onNavigate?.();
            handleLogout();
          }}
        >
          <LogOut className="text-destructive" aria-hidden="true" />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
