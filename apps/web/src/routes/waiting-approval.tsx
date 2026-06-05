import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Clock, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";
import { normalizeProfileStatus } from "../lib/profile";
import { clearAuthLocalState } from "../lib/authLocalState";
import {
  shouldPollWaitingApproval,
  WAITING_APPROVAL_POLL_INTERVAL_MS,
} from "./waitingApprovalPolling";

type WaitingApprovalProfile = {
  status?: string | null;
  is_deleted?: boolean | null;
};

export default function WaitingApprovalPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  const handleLogout = async () => {
    clearAuthLocalState({ markLoggedOut: true });
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn("[WaitingApproval] signOut failed during logout:", error);
    } finally {
      navigate({ to: "/" });
    }
  };

  useEffect(() => {
    const checkStatus = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/" });
        return;
      }

      setEmail(user.email || "");

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("status, is_deleted")
        .eq("id", user.id)
        .maybeSingle();

      const isMissingColumn = error?.code === "42703" || error?.message?.toLowerCase().includes("is_deleted");

      const resolvedProfile: WaitingApprovalProfile = isMissingColumn
        ? ((await supabase
            .from("profiles")
            .select("status")
            .eq("id", user.id)
            .maybeSingle()
          ).data as WaitingApprovalProfile | null) ?? { status: null, is_deleted: false }
        : (profile as WaitingApprovalProfile | null) ?? { status: null, is_deleted: false };

      const profileStatus = normalizeProfileStatus(resolvedProfile?.status);

      if (resolvedProfile?.is_deleted) {
        clearAuthLocalState({ markLoggedOut: true });
        try {
          await supabase.auth.signOut();
        } catch (error) {
          console.warn(
            "[WaitingApproval] signOut failed during deleted-account cleanup:",
            error,
          );
        } finally {
          navigate({ to: "/" });
        }
        return;
      }

      if (profileStatus === "active") {
        navigate({ to: "/dashboard" });
      } else if (profileStatus === "inactive") {
        clearAuthLocalState({ markLoggedOut: true });
        try {
          await supabase.auth.signOut();
        } catch (error) {
          console.warn(
            "[WaitingApproval] signOut failed during inactive-account cleanup:",
            error,
          );
        } finally {
          navigate({ to: "/" });
        }
      }
    };

    const checkVisibleStatus = () => {
      if (shouldPollWaitingApproval(document)) {
        void checkStatus();
      }
    };

    void checkStatus();
    const interval = setInterval(
      checkVisibleStatus,
      WAITING_APPROVAL_POLL_INTERVAL_MS,
    );
    document.addEventListener("visibilitychange", checkVisibleStatus);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", checkVisibleStatus);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Trainers SuperApp
          </h1>
          <p className="text-sm text-gray-500 mt-1">Workspace internal</p>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-6 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <Clock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">
            Menunggu persetujuan
          </h2>
          <p className="mt-4 text-sm text-gray-500">
            Akun {email && <>({email}) </>}berhasil dibuat dan sedang menunggu
            verifikasi trainer. Halaman ini akan memeriksa status secara
            berkala.
          </p>
          <div className="mt-6 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700">
            Estimasi normal sekitar 1x24 jam. Jika akses dibutuhkan segera,
            hubungi trainer atau admin Anda.
          </div>
          <button
            onClick={handleLogout}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold hover:bg-gray-50 transition"
          >
            <LogOut className="h-4 w-4" />
            Keluar dari Akun
          </button>
        </div>
      </div>
    </div>
  );
}
