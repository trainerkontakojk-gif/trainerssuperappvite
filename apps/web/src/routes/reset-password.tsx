import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle, KeyRound, Loader2, X } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setSessionReady(true);
    });

    const timeout = setTimeout(() => {
      if (!sessionReady) setSessionError(true);
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [sessionReady]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Password dan konfirmasi password tidak cocok.");
      return;
    }
    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError("Password harus mengandung minimal 1 huruf besar (A-Z).");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("Password harus mengandung minimal 1 angka (0-9).");
      return;
    }

    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    setSuccess(true);
    setTimeout(() => navigate({ to: "/dashboard" }), 2500);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Trainers SuperApp
          </h1>
          <p className="text-sm text-gray-500 mt-1">Workspace internal</p>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-6">
          {sessionError ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                <X className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                Tautan tidak valid
              </h2>
              <p className="mt-3 text-sm text-gray-500">
                Tautan pemulihan mungkin sudah kedaluwarsa atau tidak valid.
              </p>
              <button
                onClick={() => navigate({ to: "/" })}
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition"
              >
                Kembali ke Login
              </button>
            </div>
          ) : !sessionReady ? (
            <div className="py-12 text-center">
              <Loader2 className="mx-auto mb-5 h-10 w-10 animate-spin text-indigo-600" />
              <h2 className="text-xl font-semibold text-gray-900">
                Memvalidasi tautan reset
              </h2>
              <p className="mt-3 text-sm text-gray-500">
                Mohon tunggu sebentar, kami sedang memastikan sesi pemulihan
                Anda aktif.
              </p>
            </div>
          ) : success ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                Password berhasil diubah
              </h2>
              <p className="mt-3 text-sm text-gray-500">
                Anda akan diarahkan kembali ke dashboard dalam beberapa detik.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <KeyRound className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                Buat password baru
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Gunakan password yang kuat agar akses ke platform tetap aman.
              </p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Password baru
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 transition"
                    placeholder="••••••••"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Konfirmasi password
                  </span>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 transition"
                    placeholder="••••••••"
                  />
                </label>
                {error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-600">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Simpan Password Baru"
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
