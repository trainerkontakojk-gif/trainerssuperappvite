import { useLocation } from "@tanstack/react-router";
import { Dialog } from "@base-ui/react/dialog";
import { useRef } from "react";
import { buildNavModel } from "./nav-config";
import { NavList } from "./NavList";
import { UserMenu } from "./UserMenu";
import { ThemeMode } from "../../hooks/useThemeMode";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  session: any;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  handleLogout: () => void;
}

/**
 * Drawer ponsel (<1024px): bottom sheet berisi daftar navigasi yang sama
 * dengan sidebar. Base UI Dialog menangani fokus, Esc, dan kunci scroll.
 */
export function MobileDrawer({
  isOpen,
  onClose,
  profile,
  session,
  theme,
  setTheme,
  handleLogout,
}: MobileDrawerProps) {
  const { pathname } = useLocation();
  // Ditutup karena pindah halaman: fokus diatur `useRouteFocus`, bukan
  // dikembalikan ke tombol pembuka.
  const navigatedRef = useRef(false);

  const handleNavigate = () => {
    navigatedRef.current = true;
    onClose();
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (open) return;
        onClose();
      }}
      onOpenChangeComplete={(open) => {
        if (open) navigatedRef.current = false;
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="mobile-drawer-backdrop fixed inset-0 z-[80] bg-background/80 lg:hidden" />
        <Dialog.Popup
          aria-label="Menu navigasi"
          finalFocus={() => !navigatedRef.current}
          className="mobile-drawer fixed inset-x-0 bottom-0 z-[80] flex max-h-[85vh] flex-col rounded-t-2xl border-t border-border bg-surface shadow-2xl outline-none lg:hidden"
        >
          <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
            <div className="h-1.5 w-12 rounded-full bg-border" />
          </div>
          <nav
            aria-label="Navigasi lengkap"
            className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
          >
            <NavList
              model={buildNavModel(profile?.role)}
              pathname={pathname}
              idPrefix="drawer"
              onNavigate={handleNavigate}
            />
          </nav>
          <div
            className="border-t border-border px-3 pt-2"
            style={{
              paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <UserMenu
              profile={profile}
              session={session}
              theme={theme}
              setTheme={setTheme}
              handleLogout={handleLogout}
              layerClassName="z-[90]"
              onNavigate={handleNavigate}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
