import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, GalleryHorizontal } from "lucide-react";
import { useQueryParams } from "../../hooks/useQueryParams";
import { profilerApi } from "../../lib/profilerService";
import type {
  ProfilerPeserta,
  ProfilerYear,
  ProfilerFolder,
} from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { timTheme } from "./utils/profilerFormatters";
import {
  SlideModeControls,
  type SlideMode,
} from "./components/slides/SlideModeControls";
import { ParticipantSlide } from "./components/slides/ParticipantSlide";
import {
  SlideCanvas,
  type SlideCanvasRef,
} from "./components/slides/SlideCanvas";
import { ProfilerPageHeader } from "./components/ProfilerPageHeader";
import { ProfilerRouteNav } from "./components/ProfilerRouteNav";
import { ProfilerFolderSelect } from "./components/ProfilerFolderSelect";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "../../components/ui/combobox";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";

type ParticipantOption = {
  value: string;
  label: string;
  participant: ProfilerPeserta;
};

export default function ProfilerSlides() {
  const navigate = useNavigate();
  const { batch, participant } = useQueryParams();
  const batchName = batch || "";

  const [initialPeserta, setPeserta] = useState<ProfilerPeserta[]>([]);
  const [initialYears, setInitialYears] = useState<ProfilerYear[]>([]);
  const [initialFolders, setInitialFolders] = useState<ProfilerFolder[]>([]);
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [slideMode, setSlideMode] = useState<SlideMode>("original");
  const canvasRef = useRef<SlideCanvasRef>(null);

  useEffect(() => {
    Promise.all([
      profilerApi.getYears(),
      profilerApi.getFolders(),
      profilerApi.getPesertaByBatch(batchName),
    ])
      .then(([y, f, pList]) => {
        const folderNames = new Set(
          f.map((folder: ProfilerFolder) => folder.name),
        );
        if (batchName && f.length > 0 && !folderNames.has(batchName)) {
          const firstFolder = f[0];
          if (firstFolder?.name) {
            navigate({
              to: "/profiler/slides",
              search: { batch: firstFolder.name },
              replace: true,
            });
          } else {
            navigate({ to: "/profiler", replace: true });
          }
          return;
        }
        setInitialYears(y);
        setInitialFolders(f);
        setPeserta(pList);
      })
      .catch(console.error);
  }, [batchName, navigate]);

  useEffect(() => {
    if (initialPeserta.length === 0) {
      if (participant) {
        navigate({ to: "/profiler/slides", search: { batch: batchName } });
      }
      setIndex(0);
      return;
    }
    if (participant) {
      const foundIndex = initialPeserta.findIndex((p) => p.id === participant);
      if (foundIndex !== -1) {
        setIndex(foundIndex);
      } else {
        setIndex(0);
        navigate({ to: "/profiler/slides", search: { batch: batchName } });
      }
    } else {
      setIndex(0);
    }
  }, [batchName, initialPeserta, participant, navigate]);

  const updateUrl = useCallback(
    (id: string) => {
      navigate({
        to: "/profiler/slides",
        search: { batch: batchName, participant: id },
      });
    },
    [navigate, batchName],
  );

  const goTo = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= initialPeserta.length) return;
      setFade(false);
      window.setTimeout(() => {
        setIndex(nextIndex);
        setFade(true);
        updateUrl(initialPeserta[nextIndex].id);
      }, 110);
    },
    [initialPeserta, updateUrl],
  );

  const prev = useCallback(() => {
    if (index > 0) goTo(index - 1);
  }, [goTo, index]);

  const next = useCallback(() => {
    if (index < initialPeserta.length - 1) goTo(index + 1);
  }, [goTo, index, initialPeserta.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [next, prev]);

  const saveAsImage = async () => {
    if (saving || savingPdf || !initialPeserta[index]) return;
    setSaving(true);
    try {
      await canvasRef.current?.saveAsImage(batchName, initialPeserta[index]);
    } catch (err: any) {
      alert("Gagal simpan gambar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveAsPDF = async () => {
    if (saving || savingPdf || !initialPeserta[index]) return;
    setSavingPdf(true);
    try {
      await canvasRef.current?.saveAsPDF(batchName, initialPeserta[index]);
    } catch (err: any) {
      alert("Gagal simpan PDF: " + err.message);
    } finally {
      setSavingPdf(false);
    }
  };

  const p = initialPeserta[index];
  const theme = p ? timTheme(p.tim || "") : timTheme("");
  const isA4Portrait = slideMode === "portraitA4";
  const participantOptions = useMemo<ParticipantOption[]>(
    () =>
      initialPeserta.map((peserta) => ({
        value: peserta.id,
        label: peserta.nama || "Tanpa nama",
        participant: peserta,
      })),
    [initialPeserta],
  );
  const selectedParticipant = p
    ? (participantOptions.find((option) => option.value === p.id) ?? null)
    : null;

  const headerActions = (
    <>
      <ProfilerFolderSelect
        years={initialYears}
        folders={initialFolders}
        value={batchName}
        label="Batch"
        hideLabel
        className="w-44 sm:w-52"
        onChange={(nextBatch) =>
          navigate({ to: "/profiler/slides", search: { batch: nextBatch } })
        }
      />
      <div className="w-52 sm:w-64">
        <Combobox
          items={participantOptions}
          value={selectedParticipant}
          autoHighlight
          isItemEqualToValue={(itemValue, nextValue) =>
            itemValue?.value === nextValue?.value
          }
          itemToStringLabel={(option) => option?.label ?? ""}
          itemToStringValue={(option) => option?.value ?? ""}
          filter={(option, query) => {
            const search = query.trim().toLocaleLowerCase("id-ID");
            return `${option.label} ${option.participant.tim ?? ""} ${
              labelJabatan[option.participant.jabatan || ""] || ""
            }`
              .toLocaleLowerCase("id-ID")
              .includes(search);
          }}
          onValueChange={(nextValue) => {
            if (nextValue) {
              const nextIndex = initialPeserta.findIndex(
                (item) => item.id === nextValue.value,
              );
              if (nextIndex !== -1) goTo(nextIndex);
            }
          }}
        >
          <ComboboxTrigger
            aria-label="Pilih peserta"
            render={
              <Button
                variant="outline"
                size="lg"
                disabled={initialPeserta.length === 0}
                className="min-h-11 w-full min-w-0 justify-between bg-background"
              />
            }
          >
            <span className="min-w-0 flex-1 truncate text-left">
              {selectedParticipant?.label ??
                (initialPeserta.length > 0
                  ? "Pilih peserta"
                  : "Belum ada peserta")}
            </span>
            {initialPeserta.length > 0 ? (
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                {index + 1}/{initialPeserta.length}
              </Badge>
            ) : null}
          </ComboboxTrigger>
          <ComboboxContent
            align="start"
            className="min-w-[min(24rem,calc(100vw-2rem))]"
          >
            <div className="border-b border-border p-1">
              <ComboboxInput
                aria-label="Cari peserta"
                placeholder="Cari nama, tim, jabatan..."
              />
            </div>
            <ComboboxEmpty>Tidak ada peserta yang cocok.</ComboboxEmpty>
            <ComboboxList>
              {(option: ParticipantOption) => (
                <ComboboxItem key={option.value} value={option}>
                  <Avatar size="sm">
                    {option.participant.foto_url ? (
                      <AvatarImage
                        src={option.participant.foto_url}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    <AvatarFallback>
                      {option.label.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {option.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.participant.tim || "Tanpa tim"} ·{" "}
                      {labelJabatan[option.participant.jabatan || ""] ||
                        option.participant.jabatan ||
                        "Tanpa jabatan"}
                    </span>
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      <SlideModeControls
        slideMode={slideMode}
        setSlideMode={setSlideMode}
        onSaveImage={saveAsImage}
        onSavePDF={saveAsPDF}
        saving={saving}
        savingPdf={savingPdf}
        disabled={!p}
      />
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ProfilerPageHeader
        backHref={`/profiler?batch=${encodeURIComponent(batchName)}`}
        backLabel="Kembali ke workspace KTP"
        compact
        actions={headerActions}
      />

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-6 lg:px-8">
          <ProfilerRouteNav active="slides" batchName={batchName} />
          <Card className="min-h-[28rem] flex-1 shadow-none">
            <CardContent
              className={`flex min-h-[28rem] flex-1 flex-col items-center justify-center p-3 sm:p-5 ${
                isA4Portrait ? "overflow-auto" : "overflow-hidden"
              }`}
            >
              {!p ? (
                <Empty className="min-h-[24rem] border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <GalleryHorizontal aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>Belum ada peserta</EmptyTitle>
                    <EmptyDescription>
                      Tambahkan peserta pada batch ini untuk menampilkan slide.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div
                  className={`flex w-full flex-1 justify-center ${
                    isA4Portrait ? "min-h-full items-start" : "items-center"
                  }`}
                >
                  <SlideCanvas
                    ref={canvasRef}
                    slideMode={slideMode}
                    fade={fade}
                    theme={theme}
                  >
                    <ParticipantSlide participant={p} slideMode={slideMode} />
                  </SlideCanvas>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-center gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="size-11"
              onClick={prev}
              disabled={!p || index === 0}
              aria-label="Peserta sebelumnya"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Badge variant="secondary" className="min-h-9 px-3 tabular-nums">
              {initialPeserta.length > 0 ? index + 1 : 0} /{" "}
              {initialPeserta.length}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="size-11"
              onClick={next}
              disabled={!p || index === initialPeserta.length - 1}
              aria-label="Peserta berikutnya"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
