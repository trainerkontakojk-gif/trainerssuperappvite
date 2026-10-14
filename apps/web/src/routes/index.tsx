import { Suspense, useContext, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu, Moon, RefreshCw, Sun, X } from "lucide-react";
import {
  LandingAuthProvider,
  AuthContext,
} from "../components/LandingAuthClient";
import { ModuleStory } from "../components/landing/ModuleStory";
import { prefersReducedMotion } from "../components/landing/reducedMotion";
import {
  SplitFlapBoard,
  type FlapFrame,
} from "../components/landing/SplitFlapBoard";
import {
  LANDING_MODULES,
  channelStyle,
} from "../components/landing/landingModules";
import { useThemeMode } from "../hooks/useThemeMode";
import "./landing.css";

const WORDMARK = ["Trainers", "SuperApp"] as const;

const HERO_INTRO: readonly FlapFrame[] = [
  {
    name: "modul-1",
    lines: ["KETIK", "PDKT"],
    inks: ["var(--ketik)", "var(--pdkt)"],
  },
  {
    name: "modul-2",
    lines: ["TELEFUN", "KTP"],
    inks: ["var(--telefun)", "var(--ktp)"],
  },
  {
    name: "modul-3",
    lines: ["SIDAK", "TNA"],
    inks: ["var(--sidak)", "var(--tna)"],
  },
];

const CYCLE = [
  {
    title: "Latih",
    text: "Peserta berlatih komunikasi lewat chat, email, dan telepon.",
    uses: ["ketik", "pdkt", "telefun"],
  },
  {
    title: "Evaluasi",
    text: "Tinjau skor audit, pola temuan, dan profil peserta.",
    uses: ["sidak", "ktp"],
  },
  {
    title: "Susun",
    text: "Ubah temuan menjadi kebutuhan dan rencana pelatihan.",
    uses: ["tna"],
  },
] as const;

const moduleCode = (id: string) =>
  LANDING_MODULES.find((item) => item.id === id)?.code ?? id;

function LandingHeader() {
  const { isCheckingAuth, isLoggedIn, openAuth } = useContext(AuthContext);
  const { theme, setTheme } = useThemeMode();
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
        <a
          className="brand"
          href="#"
          aria-label="Trainers SuperApp, kembali ke atas"
        >
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span className="brand-name">Trainers SuperApp</span>
        </a>
        <nav className="desktop-nav" aria-label="Navigasi utama">
          <a href="#modul">Modul</a>
          <a href="#alur-kerja">Alur kerja</a>
        </nav>
        <div className="header-actions">
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
        <a href="#modul" onClick={closeMenu}>
          Modul
        </a>
        <a href="#alur-kerja" onClick={closeMenu}>
          Alur kerja
        </a>
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

function WorkflowCycle() {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      const progress = prefersReducedMotion()
        ? 1
        : Math.min(
            1,
            Math.max(
              0,
              (window.innerHeight * 0.8 - box.top) / (box.height * 0.9),
            ),
          );
      element.style.setProperty("--progress", progress.toFixed(4));
      setLit(
        CYCLE.filter(
          (_, index) => progress >= (index / (CYCLE.length - 1)) * 0.94,
        ).length,
      );
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
    };
  }, []);

  return (
    <section
      className="lp-container cycle-wrap"
      id="alur-kerja"
      aria-labelledby="workflow-title"
    >
      <div className="section-heading">
        <h2 id="workflow-title">
          Satu siklus.
          <br />
          Terus berputar.
        </h2>
        <p>
          Latihan menghasilkan data, data menunjukkan kebutuhan, kebutuhan
          menjadi rencana pelatihan berikutnya.
        </p>
      </div>
      <div className="cycle" ref={ref}>
        <span className="cycle-track" aria-hidden="true">
          <i />
        </span>
        <ol className="cycle-list">
          {CYCLE.map((step, index) => (
            <li key={step.title} className={index < lit ? "lit" : undefined}>
              <span className="node" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <span className="uses">
                {step.uses.map((id) => (
                  <span key={id} style={channelStyle(id)}>
                    {moduleCode(id)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="loop-note">
        <RefreshCw className="icon" aria-hidden="true" />
        Rencana pelatihan menjadi dasar latihan berikutnya.
      </p>
    </section>
  );
}

function FinalCta() {
  const { isCheckingAuth, isLoggedIn, openAuth } = useContext(AuthContext);
  return (
    <section className="lp-container final-cta" aria-labelledby="cta-title">
      <h2 id="cta-title">
        Mulai dari
        <br />
        satu tempat.
      </h2>
      <p>
        Masuk dengan akun yang sudah disetujui, atau ajukan akses sesuai peran
        Anda di tim.
      </p>
      <div className="final-actions">
        {isCheckingAuth ? null : isLoggedIn ? (
          <Link to="/dashboard" className="button primary large">
            Buka Dashboard
            <ArrowRight className="icon arrow-icon" aria-hidden="true" />
          </Link>
        ) : (
          <>
            <button
              type="button"
              className="button primary large"
              onClick={() => openAuth("login")}
            >
              Masuk ke Platform
              <ArrowRight className="icon arrow-icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="button ghost large"
              onClick={() => openAuth("register")}
            >
              Ajukan Akses
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function LandingFooter() {
  const { isCheckingAuth, isLoggedIn, openAuth } = useContext(AuthContext);
  return (
    <footer className="site-footer">
      <div className="lp-container footer-grid">
        <div className="footer-board">
          <span className="sr-only">Trainers SuperApp</span>
          <SplitFlapBoard
            lines={WORDMARK}
            cols={8}
            ink="var(--fg)"
            interactive
          />
          <p className="footer-tagline">
            Simulasi, profil peserta, analisis kualitas, dan kebutuhan pelatihan
            dalam satu platform untuk tim trainer.
          </p>
        </div>
        <nav className="footer-nav" aria-label="Navigasi footer">
          <div>
            <h2 className="footer-title">Modul</h2>
            <ul className="modules">
              {LANDING_MODULES.map((item) => (
                <li key={item.id}>
                  <a href={`#modul-${item.id}`} style={channelStyle(item.id)}>
                    {item.code}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="footer-title">Platform</h2>
            <ul>
              <li>
                <a href="#alur-kerja">Alur kerja</a>
              </li>
              {isCheckingAuth ? null : isLoggedIn ? (
                <li>
                  <Link to="/dashboard">Dashboard</Link>
                </li>
              ) : (
                <>
                  <li>
                    <button type="button" onClick={() => openAuth("login")}>
                      Masuk
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => openAuth("register")}>
                      Ajukan Akses
                    </button>
                  </li>
                </>
              )}
            </ul>
          </div>
        </nav>
      </div>
      <div className="lp-container">
        <div className="footer-bottom">
          <p>
            <span>© 2026 Trainers SuperApp</span>
          </p>
          <a href="#">Kembali ke atas</a>
        </div>
      </div>
    </footer>
  );
}

function LandingContent() {
  return (
    <div className="landing-wrapper">
      <a className="skip-link" href="#konten">
        Langsung ke konten
      </a>
      <LandingHeader />
      <main id="konten">
        <section className="lp-container hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className="wordmark">
            <span className="sr-only">Trainers SuperApp</span>
            <SplitFlapBoard
              lines={WORDMARK}
              cols={8}
              ink="var(--fg)"
              intro={HERO_INTRO}
              finalFrame="wordmark"
              interactive
            />
          </h1>
          <span className="hero-cue" aria-hidden="true">
            Gulir
          </span>
        </section>
        <ModuleStory />
        <WorkflowCycle />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}

export default function IndexPage() {
  return (
    <Suspense fallback={null}>
      <LandingAuthProvider>
        <LandingContent />
      </LandingAuthProvider>
    </Suspense>
  );
}
