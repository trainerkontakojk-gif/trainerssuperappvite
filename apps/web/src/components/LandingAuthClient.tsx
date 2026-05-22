import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useNavigate, useSearch, Link } from "@tanstack/react-router";
import { Loader2, ArrowRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { ThemeToggle } from "./ThemeToggle";
import AuthModal from "./AuthModal";

type AuthContextType = {
  isLoggedIn: boolean;
  isCheckingAuth: boolean;
  openAuth: (mode: "login" | "register" | "forgot") => void;
};

export const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  isCheckingAuth: true,
  openAuth: () => {},
});

export function LandingAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const search = useSearch({ strict: false }) as any;
  const navigate = useNavigate();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot">(
    "login",
  );
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const initialNotice = useMemo(() => {
    const msg = search.message;
    if (msg === "rejected")
      return {
        type: "error" as const,
        text: "Akun Anda belum disetujui untuk mengakses sistem.",
      };
    if (msg === "deleted")
      return { type: "error" as const, text: "Akun Anda telah dinonaktifkan." };
    if (msg === "profile-unavailable")
      return {
        type: "error" as const,
        text: "Data profil akun tidak ditemukan atau gagal diverifikasi. Silakan hubungi admin.",
      };
    return undefined;
  }, [search.message]);

  useEffect(() => {
    const authParam = search.auth;
    if (
      authParam === "login" ||
      authParam === "register" ||
      authParam === "forgot"
    ) {
      setAuthMode(authParam);
      setShowAuthModal(true);
    }
  }, [search.auth]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setIsCheckingAuth(false);
        console.warn(
          "[LandingAuthClient] Auth check timed out, showing login fallback",
        );
      }
    }, 5000);

    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (!cancelled) {
          setIsLoggedIn(!!user);
          setIsCheckingAuth(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[LandingAuthClient] Auth check failed:", err);
          setIsLoggedIn(false);
          setIsCheckingAuth(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  const handleOpenAuth = useCallback(
    (mode: "login" | "register" | "forgot") => {
      setAuthMode(mode);
      setShowAuthModal(true);
    },
    [],
  );

  const handleCloseAuth = useCallback(() => {
    setShowAuthModal(false);
    navigate({
      search: ((prev: any) => {
        const copy = { ...prev };
        delete copy.auth;
        delete copy.message;
        return copy;
      }) as any,
      replace: true,
    });
  }, [navigate]);

  return (
    <AuthContext.Provider
      value={{ isLoggedIn, isCheckingAuth, openAuth: handleOpenAuth }}
    >
      {children}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={handleCloseAuth}
          initialMode={authMode}
          initialNotice={initialNotice}
        />
      )}
    </AuthContext.Provider>
  );
}

export function NavbarAuthActions() {
  const { isCheckingAuth, isLoggedIn, openAuth } = useContext(AuthContext);
  return (
    <div className="flex items-center gap-4">
      {!isCheckingAuth && !isLoggedIn && (
        <button
          onClick={() => openAuth("login")}
          className="px-4 py-2 rounded-full text-sm font-semibold text-muted-foreground transition hover:text-foreground hover:bg-muted/50"
        >
          Masuk
        </button>
      )}
      {isLoggedIn && (
        <Link
          to="/dashboard"
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          Dashboard
        </Link>
      )}
      <ThemeToggle />
    </div>
  );
}

export function HeroAuthActions() {
  const { isCheckingAuth, isLoggedIn, openAuth } = useContext(AuthContext);
  if (isCheckingAuth) {
    return (
      <div className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground opacity-70">
        <Loader2 className="h-4 w-4 animate-spin" />
        Menyiapkan akses
      </div>
    );
  }
  if (isLoggedIn) {
    return (
      <Link
        to="/dashboard"
        className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5"
      >
        Buka Dashboard
        <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <>
      <button
        onClick={() => openAuth("login")}
        className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-10 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        Masuk ke Platform
        <ArrowRight className="h-4 w-4" />
      </button>
      <button
        onClick={() => openAuth("register")}
        className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card/50 px-8 text-sm font-semibold transition hover:bg-muted/50"
      >
        Ajukan Akses
      </button>
    </>
  );
}

export function FooterAuthActions() {
  const { isCheckingAuth, isLoggedIn, openAuth } = useContext(AuthContext);
  if (isCheckingAuth) return null;
  if (isLoggedIn) return null;

  return (
    <>
      <button
        onClick={() => openAuth("login")}
        className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-10 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.05]"
      >
        Mulai Sekarang
        <ArrowRight className="h-4 w-4" />
      </button>
      <button
        onClick={() => openAuth("register")}
        className="text-sm font-semibold hover:underline"
      >
        Belum punya akses? Minta akses
      </button>
    </>
  );
}
