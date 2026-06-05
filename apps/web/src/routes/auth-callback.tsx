import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "../lib/supabase";
import { fetchAuthProfile } from "../lib/fetchAuthProfile";
import {
  getAuthCallbackDestination,
  getAuthCallbackError,
} from "./auth-callback-contract";

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const completeAuth = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (cancelled) return;
      const authError = getAuthCallbackError(error, session);
      if (authError) {
        setErrorMessage(authError);
        return;
      }

      try {
        const profile = await fetchAuthProfile(session!.user.id);
        if (cancelled) return;
        await navigate({
          to: getAuthCallbackDestination(profile),
          replace: true,
        });
      } catch {
        if (!cancelled) {
          setErrorMessage(
            "Profil login tidak dapat dimuat. Silakan kembali dan coba lagi.",
          );
        }
      }
    };

    void completeAuth();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (errorMessage) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
        <Link
          to="/"
          className="text-sm font-semibold text-primary transition hover:underline"
        >
          Kembali ke halaman login
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Memproses sesi login...</p>
    </main>
  );
}
