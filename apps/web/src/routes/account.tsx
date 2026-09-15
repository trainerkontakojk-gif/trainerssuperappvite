import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, LogOut } from "lucide-react";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { accountApi } from "../lib/accountApi";
import { signOutLocalSession } from "../lib/session-logout";
import { getErrorMessage } from "../lib/api";

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
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [sessionActionError, setSessionActionError] = useState<string | null>(
    null,
  );

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

  async function handleRevokeAllSessions() {
    if (
      !window.confirm(
        "Logout dari semua perangkat? Anda akan diminta masuk kembali di browser ini.",
      )
    ) {
      return;
    }

    setRevokingSessions(true);
    setSessionActionError(null);

    try {
      await accountApi.revokeAllSessions();
      await signOutLocalSession({ markLoggedOut: true, redirectTo: "/" });
    } catch (error) {
      setSessionActionError(
        getErrorMessage(error, "Gagal logout dari semua perangkat."),
      );
    } finally {
      setRevokingSessions(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Akun
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Pengaturan profil
        </h1>
        <p className="text-sm text-muted-foreground">
          Kelola nama tampilan dan password akun Anda dari satu halaman.
        </p>
      </header>

      {error && (
        <Alert variant="destructive" className="items-start">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profil pengguna</CardTitle>
          <CardDescription>
            Email login: {loadingProfile ? "Memuat..." : email || "-"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveName} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account-full-name">Nama tampil</Label>
              <Input
                id="account-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Masukkan nama"
                className="min-h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={savingName || loadingProfile}
              className="min-h-11"
            >
              {savingName ? "Menyimpan..." : "Simpan nama"}
            </Button>
            {nameMessage && (
              <p className="text-sm text-emerald-600" role="status">
                {nameMessage}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ganti password</CardTitle>
          <CardDescription>
            Gunakan minimal 6 karakter agar akun tetap aman.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account-new-password">Password baru</Label>
              <Input
                id="account-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-confirm-password">
                Konfirmasi password
              </Label>
              <Input
                id="account-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="min-h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={savingPassword}
              className="min-h-11"
            >
              {savingPassword ? "Menyimpan..." : "Perbarui password"}
            </Button>
            {passwordMessage && (
              <p className="text-sm text-emerald-600" role="status">
                {passwordMessage}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keamanan sesi</CardTitle>
          <CardDescription>
            Keluar dari browser ini sekarang. Perangkat lain akan diminta login
            ulang saat sesi mereka dipakai kembali.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            onClick={handleRevokeAllSessions}
            disabled={revokingSessions}
            className="min-h-11"
          >
            <LogOut aria-hidden="true" />
            {revokingSessions ? "Memproses..." : "Logout dari Semua Perangkat"}
          </Button>
          {sessionActionError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {sessionActionError}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
