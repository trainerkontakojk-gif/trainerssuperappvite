import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { AgentKtpSelf } from "@trainers/types";
import { SidakPageHeader } from "../../components/sidak/SidakPageHeader";
import QaStatePanel from "../../components/ui/QaStatePanel";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useApi } from "../../hooks/useApi";

/**
 * `/sidak/saya`: stable entry for an agent (login, nav). Resolves the own
 * participant from `GET /profiler/me` and opens its SIDAK agent detail; only
 * an unlinked account or a failed lookup stays on this page.
 */
export default function SidakSayaPage() {
  const navigate = useNavigate();
  const { data, error, refetch } = useApi<AgentKtpSelf>("/profiler/me");
  const ownId = data?.linked ? data.peserta.id : null;

  useEffect(() => {
    if (ownId)
      void navigate({
        to: "/sidak/agents/$id",
        params: { id: ownId },
        replace: true,
      });
  }, [navigate, ownId]);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 pt-6 pb-28 sm:px-6">
      <SidakPageHeader title="SIDAK saya" eyebrow={null} />
      {error ? (
        <QaStatePanel
          type="error"
          title="Data SIDAK Anda belum dapat dimuat"
          description={error}
          action={
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => void refetch()}
            >
              Coba lagi
            </Button>
          }
        />
      ) : data && !data.linked ? (
        <QaStatePanel
          type="empty"
          title="Akun Anda belum ditautkan ke data peserta"
          description="Hubungi admin atau trainer untuk menautkan akun Anda. Latihan tetap tersedia."
        />
      ) : (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <span className="sr-only">Membuka data SIDAK Anda</span>
        </div>
      )}
    </div>
  );
}
