import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, Loader2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { fetchAuthProfile } from "../lib/fetchAuthProfile";
import {
  clearLogoutGuestLock,
} from "../lib/authLocalState";
import { signOutLocalSession } from "../lib/session-logout";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register" | "forgot";
  initialNotice?: { type: "error" | "info"; text: string };
}

const AUTH_COPY = {
  login: {
    title: "Masuk",
    description: "Silakan masuk menggunakan akun aktif perusahaan Anda.",
    submit: "Masuk sekarang",
  },
  register: {
    title: "Minta Akses Baru",
    description:
      "Isi data berikut untuk meminta akses ke sistem. Proses ini memerlukan persetujuan dari administrator.",
    submit: "Ajukan akses",
  },
  forgot: {
    title: "Lupa Kata Sandi",
    description:
      "Masukkan email Anda dan kami akan mengirimkan instruksi untuk mengatur ulang kata sandi.",
    submit: "Kirim tautan pemulihan",
  },
} as const;

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = "login",
  initialNotice,
}: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">(
    initialMode,
  );
  const [error, setError] = useState<string | null>(
    initialNotice?.type === "error" ? initialNotice.text : null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(
    initialNotice?.type === "info" ? initialNotice.text : null,
  );
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(initialNotice?.type === "error" ? initialNotice.text : null);
      setSuccessMessage(
        initialNotice?.type === "info" ? initialNotice.text : null,
      );
      setLoading(false);
      setForgotLoading(false);
      setGoogleLoading(false);
    }
  }, [initialMode, isOpen, initialNotice]);

  const handleClose = () => {
    setError(null);
    setSuccessMessage(null);
    setLoading(false);
    setForgotLoading(false);
    setGoogleLoading(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("auth");
    window.history.replaceState({}, "", url.pathname || "/");
    onClose();
  };

  async function waitForActiveSession() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (user && !error) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        return session;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return null;
  }

  async function resolvePostLoginPath(userId: string) {
    const profile = await fetchAuthProfile(userId);

    if (!profile) {
      console.warn("[AuthModal] Failed to fetch profile after login");
      return "/dashboard";
    }

    if (profile.is_deleted) {
      await signOutLocalSession({ markLoggedOut: false, redirectTo: null });
      throw new Error(
        "Akun Anda telah dinonaktifkan. Silakan hubungi administrator.",
      );
    }

    if (profile.status === "pending") {
      return "/waiting-approval";
    }

    if (profile.status === "inactive") {
      await signOutLocalSession({ markLoggedOut: false, redirectTo: null });
      throw new Error(
        "Akun Anda belum dapat diakses. Silakan hubungi administrator Anda.",
      );
    }

    return "/dashboard";
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearLogoutGuestLock();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      if (mode === "login") {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (loginError) {
          setError(loginError.message);
          setLoading(false);
          return;
        }

        const session = await waitForActiveSession();

        if (!session?.user) {
          setError("Sesi login belum siap. Silakan coba sekali lagi.");
          setLoading(false);
          return;
        }

        const nextPath = await resolvePostLoginPath(session.user.id);
        localStorage.setItem("auth_token", session.access_token);
        window.location.assign(nextPath);
        return;
      }

      const role = formData.get("role") as string;
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        const isDuplicate =
          (signUpError as any).code === "user_already_exists" ||
          signUpError.message?.toLowerCase().includes("already registered") ||
          signUpError.message?.toLowerCase().includes("already exists") ||
          signUpError.message?.toLowerCase().includes("user already");

        if (isDuplicate) {
          setSuccessMessage(
            "Permintaan akses berhasil dikirim! Anda bisa masuk setelah akun Anda disetujui.",
          );
          setLoading(false);
          return;
        }
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        const { error: profileError } = await supabase.from("profiles").insert([
          {
            id: data.user.id,
            email,
            role,
            status: "pending",
          },
        ]);

        if (profileError) {
          if (
            profileError.code === "23505" ||
            profileError.message?.toLowerCase().includes("duplicate")
          ) {
            setSuccessMessage(
              "Permintaan akses berhasil dikirim! Anda bisa masuk setelah akun Anda disetujui.",
            );
            setLoading(false);
            return;
          }
          setError(
            "Terjadi masalah jaringan saat mendaftar. Silakan coba lagi.",
          );
          setLoading(false);
          return;
        }
      }

      setSuccessMessage(
        "Permintaan akses berhasil dikirim! Anda bisa masuk setelah akun Anda disetujui.",
      );
    } catch (err: any) {
      console.error("[AuthModal] Submission error:", err);
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        setError(
          "Gagal menghubungkan ke server. Periksa koneksi internet Anda atau hubungi admin jika masalah berlanjut.",
        );
      } else {
        setError(
          err.message ||
            "Terjadi kesalahan sistem saat memproses permintaan Anda.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearLogoutGuestLock();
    setForgotLoading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    try {
      const { error: forgotError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/reset-password`,
        },
      );

      if (forgotError) {
        setError(forgotError.message);
      } else {
        setSuccessMessage(
          "Tautan untuk mengatur ulang kata sandi sudah dikirim ke email Anda.",
        );
      }
    } catch (err: any) {
      console.error("[AuthModal] Forgot password error:", err);
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        setError(
          "Gagal menghubungkan ke server. Silakan periksa koneksi internet Anda.",
        );
      } else {
        setError(
          err.message || "Gagal memproses permintaan pemulihan kata sandi.",
        );
      }
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleGoogleLogin() {
    clearLogoutGuestLock();
    setGoogleLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setError(error.message);
        setGoogleLoading(false);
      }
    } catch (err: any) {
      console.error("[AuthModal] Google OAuth error:", err);
      setError("Gagal menginisialisasi login Google. Silakan coba lagi.");
      setGoogleLoading(false);
    }
  }

  const content = AUTH_COPY[mode];
  const isBusy = loading || forgotLoading || googleLoading;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 auth-modal-wrapper"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 am-overlay"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            className="am-card"
          >
            <button
              onClick={handleClose}
              className="am-close"
              aria-label="Tutup"
            >
              <X className="h-4 w-4" />
            </button>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
              >
                <div className="mb-6">
                  <h2 className="am-title">{content.title}</h2>
                  <p className="am-desc">{content.description}</p>
                </div>

                {mode === "forgot" ? (
                  <form onSubmit={handleForgotPassword}>
                    <label className="am-field">
                      <span className="am-label">Email</span>
                      <input
                        type="email"
                        name="email"
                        required
                        disabled={forgotLoading}
                        autoComplete="email"
                        placeholder="nama@perusahaan.com"
                        className="am-input"
                      />
                    </label>

                    <Feedback error={error} successMessage={successMessage} />

                    <button
                      type="submit"
                      disabled={forgotLoading || !!successMessage}
                      className="am-btn-primary"
                    >
                      {forgotLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        content.submit
                      )}
                      {!forgotLoading && <ArrowRight className="h-4 w-4" />}
                    </button>
                  </form>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={isBusy || !!successMessage}
                      className="am-btn-google"
                    >
                      {googleLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <svg className="h-4 w-4" viewBox="0 0 24 24">
                          <path
                            fill="currentColor"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="currentColor"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="currentColor"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          />
                          <path
                            fill="currentColor"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          />
                        </svg>
                      )}
                      <span>Lanjutkan dengan Google</span>
                    </button>

                    <div className="am-divider">atau gunakan email</div>

                    <form onSubmit={handleSubmit}>
                      <label className="am-field">
                        <span className="am-label">Email</span>
                        <input
                          type="email"
                          name="email"
                          required
                          disabled={loading}
                          autoComplete="email"
                          placeholder="nama@perusahaan.com"
                          className="am-input"
                        />
                      </label>

                      <label className="am-field">
                        <span className="am-label">Password</span>
                        <input
                          type="password"
                          name="password"
                          required
                          minLength={6}
                          disabled={loading}
                          autoComplete={
                            mode === "login"
                              ? "current-password"
                              : "new-password"
                          }
                          placeholder="••••••••"
                          className="am-input tracking-[0.2em]"
                        />
                      </label>

                      {mode === "login" && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: "-8px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setSuccessMessage(null);
                              setMode("forgot");
                            }}
                            className="am-link"
                            disabled={loading}
                          >
                            Lupa kata sandi?
                          </button>
                        </div>
                      )}

                      {mode === "register" && (
                        <label className="am-field">
                          <span className="am-label">Peran</span>
                          <select
                            name="role"
                            required
                            disabled={loading}
                            className="am-input"
                          >
                            <option value="agent">Agent</option>
                            <option value="leader">Leader</option>
                            <option value="trainer">Trainer</option>
                          </select>
                        </label>
                      )}

                      <Feedback error={error} successMessage={successMessage} />

                      <button
                        type="submit"
                        disabled={loading || !!successMessage}
                        className="am-btn-primary"
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          content.submit
                        )}
                        {!loading && <ArrowRight className="h-4 w-4" />}
                      </button>
                    </form>
                  </div>
                )}

                <div style={{ marginTop: "32px", textAlign: "center" }}>
                  {mode === "forgot" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSuccessMessage(null);
                        setMode("login");
                      }}
                      className="am-link"
                      disabled={isBusy}
                    >
                      Sudah ingat kata sandimu? Masuk lagi
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSuccessMessage(null);
                        setMode(mode === "login" ? "register" : "login");
                      }}
                      className="am-link"
                      disabled={isBusy}
                    >
                      {mode === "login"
                        ? "Belum punya akun? Ajukan akses"
                        : "Sudah punya akun? Masuk di sini"}
                    </button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Feedback({
  error,
  successMessage,
}: {
  error: string | null;
  successMessage: string | null;
}) {
  return (
    <>
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div className="am-error">
              <AlertCircle
                className="h-4 w-4 shrink-0"
                style={{ marginTop: "2px" }}
              />
              <span>{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div className="am-success">{successMessage}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
