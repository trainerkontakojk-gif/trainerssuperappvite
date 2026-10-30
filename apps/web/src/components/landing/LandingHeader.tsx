import { useContext, useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Moon, Sun, X } from "lucide-react";
import { AuthContext } from "../LandingAuthClient";
import { useThemeMode } from "../../hooks/useThemeMode";

const brand = (
  <>
    <span className="brand-mark" aria-hidden="true">
      S
    </span>
    <span className="brand-name">Trainers SuperApp</span>
  </>
);

/** Public header shared by the landing page and /kegiatan; styled by landing.css. */
export function LandingHeader() {
  const { isCheckingAuth, isLoggedIn, openAuth } = useContext(AuthContext);
  const { theme, setTheme } = useThemeMode();
  const isKegiatan = useRouterState({
    select: (state) => state.location.pathname === "/kegiatan",
  });
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const desktop = window.matchMedia("(min-width: 761px)");
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    const onWide = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onWide);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header" data-scrolled={scrolled || undefined}>
      <div className="lp-container header-inner">
        {isKegiatan ? (
          <Link
            className="brand"
            to="/"
            aria-label="Trainers SuperApp, ke beranda"
          >
            {brand}
          </Link>
        ) : (
          <a
            className="brand"
            href="#"
            aria-label="Trainers SuperApp, kembali ke atas"
          >
            {brand}
          </a>
        )}
        <div className="header-actions">
          <Link
            className="header-link"
            to="/kegiatan"
            aria-current={isKegiatan ? "page" : undefined}
          >
            Kegiatan Trainers
          </Link>
          {isCheckingAuth ? null : isLoggedIn ? (
            <Link to="/dashboard" className="button primary">
              Dashboard
            </Link>
          ) : (
            <>
              <button
                type="button"
                className="button ghost"
                onClick={() => openAuth("login")}
              >
                Masuk
              </button>
              <button
                type="button"
                className="button primary header-register"
                onClick={() => openAuth("register")}
              >
                Ajukan Akses
              </button>
            </>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label={
              theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"
            }
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? (
              <Sun className="icon" aria-hidden="true" />
            ) : (
              <Moon className="icon" aria-hidden="true" />
            )}
          </button>
          <button
            ref={menuButton}
            type="button"
            className="icon-button menu-toggle"
            aria-label="Buka navigasi"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X className="icon" aria-hidden="true" />
            ) : (
              <Menu className="icon" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      <nav
        className="lp-container mobile-nav"
        id="mobile-nav"
        aria-label="Navigasi mobile"
        hidden={!menuOpen}
      >
        <Link to="/kegiatan" onClick={closeMenu}>
          Kegiatan Trainers
        </Link>
        {isCheckingAuth ? null : isLoggedIn ? (
          <Link to="/dashboard" onClick={closeMenu}>
            Dashboard
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              closeMenu();
              openAuth("register");
            }}
          >
            Ajukan Akses
          </button>
        )}
      </nav>
    </header>
  );
}
