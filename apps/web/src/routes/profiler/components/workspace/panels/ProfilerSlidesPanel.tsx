import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, GalleryHorizontal } from "lucide-react";
import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { timTheme } from "../../../utils/profilerFormatters";
import { ParticipantSlide } from "../../slides/ParticipantSlide";
import { SlideCanvas, type SlideCanvasRef } from "../../slides/SlideCanvas";
import {
  SlideModeControls,
  type SlideMode,
} from "../../slides/SlideModeControls";

type ParticipantOption = {
  value: string;
  label: string;
  participant: ProfilerPeserta;
};

interface ProfilerSlidesPanelProps {
  batchName: string;
  peserta: ProfilerPeserta[];
  /** Peserta yang ditampilkan (dari `?participant=`); kosong = peserta pertama. */
  participantId: string | null;
  /** `null` menghapus `?participant=` (mis. id basi yang tidak ada di batch). */
  onParticipantChange: (id: string | null) => void;
}

/** Slide profil satu peserta per halaman, dengan simpan PNG/PDF. */
export default function ProfilerSlidesPanel({
  batchName,
  peserta,
  participantId,
  onParticipantChange,
}: ProfilerSlidesPanelProps) {
  const [fade, setFade] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [slideMode, setSlideMode] = useState<SlideMode>("original");
  const canvasRef = useRef<SlideCanvasRef>(null);

  const foundIndex = participantId
    ? peserta.findIndex((p) => p.id === participantId)
    : -1;
  const index = foundIndex === -1 ? 0 : foundIndex;

  // Id peserta yang tidak ada di batch ini dibersihkan dari URL agar tautan
  // yang dibagikan tidak membawa id basi; tampilan jatuh ke peserta pertama.
  const hasStaleParticipant = Boolean(participantId) && foundIndex === -1;
  useEffect(() => {
    if (hasStaleParticipant) onParticipantChange(null);
  }, [hasStaleParticipant, onParticipantChange]);
  const current = peserta[index];

  const goTo = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= peserta.length) return;
      setFade(false);
      window.setTimeout(() => {
        onParticipantChange(peserta[nextIndex].id);
        setFade(true);
      }, 110);
    },
    [onParticipantChange, peserta],
  );

  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [next, prev]);

  const save = async (kind: "image" | "pdf") => {
    if (saving || savingPdf || !current) return;
    const setBusy = kind === "image" ? setSaving : setSavingPdf;
    setBusy(true);
    try {
      if (kind === "image") {
        await canvasRef.current?.saveAsImage(batchName, current);
      } else {
        await canvasRef.current?.saveAsPDF(batchName, current);
      }
    } catch (err: any) {
      alert(
        `Gagal simpan ${kind === "image" ? "gambar" : "PDF"}: ${err.message}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const options = useMemo<ParticipantOption[]>(
    () =>
      peserta.map((p) => ({
        value: p.id,
        label: p.nama || "Tanpa nama",
        participant: p,
      })),
    [peserta],
  );
  const selectedOption = current
    ? (options.find((option) => option.value === current.id) ?? null)
    : null;

  if (!current) {
    return (
      <Empty className="min-h-56 border border-dashed border-border p-8">
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
    );
  }

  const isA4Portrait = slideMode === "portraitA4";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full lg:w-72">
          <Combobox
            items={options}
            value={selectedOption}
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
              if (!nextValue) return;
              const nextIndex = peserta.findIndex(
                (item) => item.id === nextValue.value,
              );
              if (nextIndex !== -1) goTo(nextIndex);
            }}
          >
            <ComboboxTrigger
              aria-label="Pilih peserta"
              render={
                <Button
                  variant="outline"
                  size="lg"
                  className="min-h-11 w-full min-w-0 justify-between bg-background"
                />
              }
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {selectedOption?.label ?? "Pilih peserta"}
              </span>
            </ComboboxTrigger>
            <ComboboxContent
              align="start"
              className="min-w-[min(24rem,calc(100vw-2rem))]"
            >
              <div className="border-b border-border p-1">
                <ComboboxInput
                  aria-label="Cari peserta slide"
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
          onSaveImage={() => save("image")}
          onSavePDF={() => save("pdf")}
          saving={saving}
          savingPdf={savingPdf}
          disabled={!current}
        />
      </div>

      {/* Slide punya lebar minimum agar tetap terbaca; di layar sempit frame
          digulir ke samping (justify-center + overflow-hidden memotong sisi kiri). */}
      <div
        tabIndex={0}
        role="region"
        aria-label={`Slide ${current.nama || "peserta"}`}
        className={`flex min-h-[24rem] w-full overflow-auto rounded-xl border border-border bg-card p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5 ${
          isA4Portrait ? "items-start" : "items-center"
        }`}
      >
        <div
          className={`mx-auto w-full ${
            isA4Portrait
              ? "min-w-[30rem] max-w-[820px]"
              : "min-w-[40rem] max-w-[1000px]"
          }`}
        >
          <SlideCanvas
            ref={canvasRef}
            slideMode={slideMode}
            fade={fade}
            theme={timTheme(current.tim || "")}
          >
            <ParticipantSlide participant={current} slideMode={slideMode} />
          </SlideCanvas>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11"
          onClick={prev}
          disabled={index === 0}
          aria-label="Peserta sebelumnya"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Badge variant="secondary" className="min-h-9 px-3 tabular-nums">
          {index + 1} / {peserta.length}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11"
          onClick={next}
          disabled={index === peserta.length - 1}
          aria-label="Peserta berikutnya"
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
