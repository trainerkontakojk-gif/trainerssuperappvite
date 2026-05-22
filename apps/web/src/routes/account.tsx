import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

export default function AccountPage() {
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      setLoadingProfile(true);
      setError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Sesi login tidak ditemukan. Silakan login ulang.");
        setLoadingProfile(false);
        return;
      }
      setEmail(user.email || "");
      setFullName(profile?.full_name || "");
      setLoadingProfile(false);
    }
    loadUser();
  }, [profile]);

  async function handleSaveName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingName(true);
    setNameMessage(null);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesi login berakhir. Silakan login ulang.");
      setSavingName(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() || null })
      .eq("id", user.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setNameMessage("Nama berhasil diperbarui.");
      setProfile({ ...profile!, full_name: fullName.trim() });
    }
    setSavingName(false);
  }

  async function handleSavePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordMessage(null);
    setError(null);

    if (newPassword.length < 6) {
      setError("Password minimal 6 karakter.");
      setSavingPassword(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      setSavingPassword(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateError) {
      setError(updateError.message);
    } else {
      setPasswordMessage("Password berhasil diperbarui.");
      setNewPassword("");
      setConfirmPassword("");
    }
    setSavingPassword(false);
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Akun
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          Pengaturan profil
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Kelola nama tampilan dan password akun Anda dari satu halaman.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">
          Profil pengguna
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Email login: {loadingProfile ? "Memuat..." : email || "-"}
        </p>
        <form onSubmit={handleSaveName} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Nama tampil
            </span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Masukkan nama"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500"
            />
          </label>
          <button
            type="submit"
            disabled={savingName || loadingProfile}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {savingName ? "Menyimpan..." : "Simpan nama"}
          </button>
          {nameMessage && (
            <p className="text-sm text-emerald-600">{nameMessage}</p>
          )}
        </form>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">
          Ganti password
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Gunakan minimal 6 karakter agar akun tetap aman.
        </p>
        <form onSubmit={handleSavePassword} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Password baru
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Konfirmasi password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500"
            />
          </label>
          <button
            type="submit"
            disabled={savingPassword}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {savingPassword ? "Menyimpan..." : "Perbarui password"}
          </button>
          {passwordMessage && (
            <p className="text-sm text-emerald-600">{passwordMessage}</p>
          )}
        </form>
      </section>
    </div>
  );
}
