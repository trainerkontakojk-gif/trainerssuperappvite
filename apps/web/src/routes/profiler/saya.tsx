import { useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { AgentKtpSelf, ProfilerPeserta } from "@trainers/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import QaStatePanel from "../../components/ui/QaStatePanel";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { useApi } from "../../hooks/useApi";
import { getPhotoFrame, getPhotoImageStyle } from "../../lib/photo-frame";
import { notify } from "../../lib/toast";
import { useAuthStore } from "../../store/authStore";
import { ParticipantSlide } from "./components/slides/ParticipantSlide";
import {
  SlideCanvas,
  type SlideCanvasRef,
} from "./components/slides/SlideCanvas";
import {
  SlideModeControls,
  type SlideMode,
} from "./components/slides/SlideModeControls";
import { timTheme } from "./utils/profilerFormatters";
import { ProfileFields } from "./components/detail/ProfilerParticipantDetail";
import { summaryLine } from "./utils/profilerSummary";
import type { KtpSayaSearch } from "./saya-search";

type KtpSayaView = "profil" | "slide";

/**
 * KTP saya: the agent's own participant row, read-only (`GET /profiler/me`),
 * as a profile or as the same slide trainers see in the KTP workspace.
 */
export default function KtpSayaPage() {
  const { data, error, refetch } = useApi<AgentKtpSelf>("/profiler/me");
  const email = useAuthStore((s) => s.profile?.email);
  const { view } = useSearch({ strict: false }) as KtpSayaSearch;
  const navigate = useNavigate();
  const current: KtpSayaView = view === "slide" ? "slide" : "profil";

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 pt-6 pb-28 sm:px-6">
      {error ? (
        <>
          <PageTitle />
          <QaStatePanel
            type="error"
            title="Data KTP Anda belum dapat dimuat"
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
        </>
      ) : !data ? (
        <>
          <PageTitle />
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
            <span className="sr-only">Memuat data KTP Anda</span>
          </div>
        </>
      ) : !data.linked ? (
        <>
          <PageTitle />
          <QaStatePanel
            type="empty"
            title="Akun Anda belum ditautkan ke data peserta"
            description="Hubungi admin atau trainer untuk menautkan akun Anda ke data KTP."
          />
        </>
      ) : (
        <section aria-label="Profil saya" className="flex flex-col gap-6">
          <header className="flex min-w-0 items-center gap-4 border-b border-border pb-6">
            <Avatar className="!size-20 shrink-0 overflow-hidden rounded-xl">
              {data.peserta.foto_url ? (
                <AvatarImage
                  src={data.peserta.foto_url}
                  alt=""
                  style={getPhotoImageStyle(
                    getPhotoFrame(data.peserta.id, data.peserta.photo_frame),
                  )}
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <AvatarFallback className="rounded-xl text-2xl">
                {data.peserta.nama?.charAt(0)?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                KTP saya · {data.peserta.batch_name}
              </p>
              <h1
                tabIndex={-1}
                className="font-outfit text-2xl font-bold tracking-tight break-words text-foreground focus:outline-none sm:text-3xl"
              >
                {data.peserta.nama || "Tanpa nama"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {summaryLine(data.peserta)}
              </p>
            </div>
          </header>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg2">
              Data ini hanya bisa dilihat. Jika ada yang perlu diubah, hubungi
              admin atau trainer.
            </p>
            <Tabs
              value={current}
              onValueChange={(value) =>
                void navigate({
                  to: "/profiler/saya",
                  search: value === "slide" ? { view: "slide" } : {},
                  replace: true,
                })
              }
            >
              <TabsList variant="default" className="h-11">
                <TabsTrigger value="profil" className="h-9 px-4">
                  Profil
                </TabsTrigger>
                <TabsTrigger value="slide" className="h-9 px-4">
                  Slide
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {current === "slide" ? (
            <OwnSlide participant={data.peserta} />
          ) : (
            <ProfileFields p={data.peserta} account={email ?? "-"} />
          )}
        </section>
      )}
    </div>
  );
}

function PageTitle() {
  return (
    <h1
      tabIndex={-1}
      className="font-display text-2xl font-bold tracking-tight text-foreground focus:outline-none"
    >
      KTP saya
    </h1>
  );
}

/** The KTP workspace slide for one participant, with PNG/PDF save. */
function OwnSlide({ participant }: { participant: ProfilerPeserta }) {
  const [slideMode, setSlideMode] = useState<SlideMode>("original");
  const [saving, setSaving] = useState<"image" | "pdf" | null>(null);
  const canvasRef = useRef<SlideCanvasRef>(null);

  const save = async (kind: "image" | "pdf") => {
    if (saving) return;
    setSaving(kind);
    try {
      if (kind === "image")
        await canvasRef.current?.saveAsImage(
          participant.batch_name,
          participant,
        );
      else
        await canvasRef.current?.saveAsPDF(participant.batch_name, participant);
    } catch {
      notify.error(
        `Gagal menyimpan ${kind === "image" ? "gambar" : "PDF"}. Silakan coba lagi.`,
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SlideModeControls
        slideMode={slideMode}
        setSlideMode={setSlideMode}
        onSaveImage={() => void save("image")}
        onSavePDF={() => void save("pdf")}
        saving={saving === "image"}
        savingPdf={saving === "pdf"}
        disabled={false}
      />
      <div
        tabIndex={0}
        role="region"
        aria-label={`Slide ${participant.nama || "peserta"}`}
        className="w-full rounded-xl border border-border bg-card p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
      >
        <SlideCanvas
          ref={canvasRef}
          slideMode={slideMode}
          fade
          theme={timTheme(participant.tim || "")}
        >
          <ParticipantSlide participant={participant} slideMode={slideMode} />
        </SlideCanvas>
      </div>
    </div>
  );
}
