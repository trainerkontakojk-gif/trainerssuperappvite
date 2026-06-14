import { Link } from "@tanstack/react-router";
import { UserCog, Sun, Moon, LogOut } from "lucide-react";
import { normalizeRoleLabel } from "../../lib/app-config";
import { ThemeMode } from "../../hooks/useThemeMode";

interface UserMenuProps {
  userInitial: string;
  userMenuOpen: boolean;
  setUserMenuOpen: (open: boolean) => void;
  userMenuRef: React.RefObject<HTMLDivElement | null>;
  profile: any;
  session: any;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  handleLogout: () => void;
}

export function UserMenu({
  userInitial,
  userMenuOpen,
  setUserMenuOpen,
  userMenuRef,
  profile,
  session,
  theme,
  setTheme,
  handleLogout,
}: UserMenuProps) {
  return (
    <div className="relative" ref={userMenuRef}>
      <button
        onClick={() => setUserMenuOpen(!userMenuOpen)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
        title={profile?.full_name || "User"}
        aria-expanded={userMenuOpen}
        aria-haspopup="true"
      >
        {userInitial}
      </button>

      {userMenuOpen && (
        <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-2xl border border-border/40 bg-card/90 p-1.5 shadow-lg shadow-black/5 backdrop-blur-xl ring-1 ring-black/5 focus:outline-none animate-in fade-in slide-in-from-top-1 duration-200 z-50">
          <div className="px-3 py-2 border-b border-border/40 mb-1">
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Signed in as</p>
            <p className="text-sm font-semibold truncate text-foreground" title={profile?.email || session?.user?.email}>
              {profile?.email || session?.user?.email}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Role: {normalizeRoleLabel(profile?.role)}</p>
          </div>
          
          <Link
            to="/account"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition cursor-pointer"
            onClick={() => setUserMenuOpen(false)}
          >
            <UserCog className="h-4 w-4 shrink-0" />
            <span>Akun</span>
          </Link>

          <button
            onClick={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              setUserMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition cursor-pointer text-left"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 shrink-0" />
            ) : (
              <Moon className="h-4 w-4 shrink-0" />
            )}
            <span>Tema {theme === "dark" ? "Terang" : "Gelap"}</span>
          </button>

          <button
            onClick={() => {
              setUserMenuOpen(false);
              handleLogout();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-500/10 transition cursor-pointer text-left font-medium"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Keluar</span>
          </button>
        </div>
      )}
    </div>
  );
}
