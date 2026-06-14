import { Link, useLocation } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { UserCog, Sun, Moon, LogOut, BarChart3 } from "lucide-react";
import { APP_MODULES, isRoleAllowed } from "../../lib/app-config";
import { SIDAK_CHILDREN, MANAGEMENT_LINKS } from "./nav-config";
import { ThemeMode } from "../../hooks/useThemeMode";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  session: any;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  handleLogout: () => void;
  hasTelefunAccess: boolean;
  openMaintenance: () => void;
}

export function MobileDrawer({
  isOpen,
  onClose,
  profile,
  session,
  theme,
  setTheme,
  handleLogout,
  hasTelefunAccess,
  openMaintenance,
}: MobileDrawerProps) {
  const { pathname } = useLocation();

  const modules = APP_MODULES.filter((m) =>
    isRoleAllowed(profile?.role, m.allowedRoles),
  );
  const managementLinks = MANAGEMENT_LINKS.filter((l) =>
    isRoleAllowed(profile?.role, l.allowedRoles),
  );

  const isModuleActive = (moduleHref: string) => {
    if (moduleHref === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(moduleHref);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[80] lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/80"
            onClick={onClose}
          />

          {/* Drawer content — slides up from bottom */}
          <motion.div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl shadow-2xl"
            style={{
              background: "var(--surface)",
              borderTop: "1px solid var(--border)",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div
                className="h-1.5 w-12 rounded-full bg-neutral-300 dark:bg-neutral-700"
              />
            </div>

            {/* User info */}
            <div className="px-6 py-4 border-b border-border">
              <p className="text-[13px] font-bold text-foreground">
                {profile?.full_name || session?.user?.email || "User"}
              </p>
              <p className="text-[11px] mt-0.5 text-muted-foreground">
                {profile?.email || session?.user?.email}
              </p>
            </div>

            {/* All modules */}
            <div className="px-4 py-3">
              <p className="px-2 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Platform
              </p>
              <div className="space-y-1">
                {modules.map((m) => {
                  const active = isModuleActive(m.href);
                  return (
                    <Link
                      key={m.id}
                      to={m.href as any}
                      onClick={(e) => {
                        if (m.id === "telefun" && !hasTelefunAccess) {
                          e.preventDefault();
                          openMaintenance();
                        } else {
                          onClose();
                        }
                      }}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
                        active
                          ? "bg-foreground/5 text-foreground font-semibold"
                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                      }`}
                    >
                      <m.icon className="h-4 w-4 shrink-0" />
                      <span>{m.shortTitle}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* SIDAK Sub-navigation for mobile */}
            {pathname.startsWith("/sidak") && (
              <div className="px-4 py-3 border-t border-border">
                <p className="px-2 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  SIDAK Menu
                </p>
                <div className="space-y-1">
                  {SIDAK_CHILDREN.filter((item) =>
                    isRoleAllowed(profile?.role, item.allowedRoles),
                  ).map((item) => {
                    const active = item.exactMatch
                      ? pathname === item.to
                      : pathname.startsWith(item.to);

                    return (
                      <Link
                        key={item.to}
                        to={item.to as any}
                        onClick={onClose}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
                          active
                            ? "bg-foreground/5 text-foreground font-semibold"
                            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                        }`}
                      >
                        <BarChart3 className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Management */}
            {managementLinks.length > 0 && (
              <div className="px-4 py-3 border-t border-border">
                <p className="px-2 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Management
                </p>
                <div className="space-y-1">
                  {managementLinks.map((item) => {
                    const active = pathname === item.to;
                    return (
                      <Link
                        key={item.to}
                        to={item.to as any}
                        onClick={onClose}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
                          active
                            ? "bg-foreground/5 text-foreground font-semibold"
                            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                        }`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div
              className="px-4 py-4 border-t border-border flex items-center gap-2"
              style={{
                paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <Link
                to="/account"
                onClick={onClose}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <UserCog className="h-4 w-4" /> Akun
              </Link>
              <button
                onClick={() => {
                  setTheme(theme === "dark" ? "light" : "dark");
                }}
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                onClick={() => {
                  onClose();
                  handleLogout();
                }}
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-[13px] font-semibold border border-red-500/30 text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
