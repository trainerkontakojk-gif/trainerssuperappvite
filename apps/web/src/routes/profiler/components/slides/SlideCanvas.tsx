import React, {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ProfilerPeserta } from "@trainers/types";

export type SlideMode = "original" | "portraitA4";

/**
 * Slide selalu ditata pada ukuran desain tetap lalu diperkecil (`scale`) agar
 * muat di layar mana pun. Dengan begitu isi slide tidak terpotong di layar
 * sempit dan hasil simpan PNG/PDF selalu berukuran sama.
 */
const DESIGN_SIZE: Record<SlideMode, { width: number; height: number }> = {
  original: { width: 1000, height: 562.5 },
  portraitA4: { width: 820, height: (820 * 297) / 210 },
};

export interface SlideCanvasRef {
  saveAsImage: (batchName: string, participant: ProfilerPeserta) => Promise<void>;
  saveAsPDF: (batchName: string, participant: ProfilerPeserta) => Promise<void>;
}

interface SlideCanvasProps {
  slideMode: SlideMode;
  fade: boolean;
  theme: {
    accent: string;
    light: string;
    label: string;
  };
  children: React.ReactNode;
}

export const SlideCanvas = forwardRef<SlideCanvasRef, SlideCanvasProps>(
  ({ slideMode, fade, theme, children }, ref) => {
    const slideRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const isA4Portrait = slideMode === "portraitA4";
    const design = DESIGN_SIZE[slideMode];

    useLayoutEffect(() => {
      const frame = frameRef.current;
      if (!frame) return;
      const update = () =>
        setScale(Math.min(1, frame.clientWidth / design.width));
      update();
      const observer = new ResizeObserver(update);
      observer.observe(frame);
      return () => observer.disconnect();
    }, [design.width]);

    const captureElementCanvas = async (target: HTMLElement | null) => {
      if (!target) return null;
      const html2canvas = (await import("html2canvas")).default;
      const { prepareHtml2CanvasClone } = await import(
        "../../../../lib/html2canvas-tailwind-fix"
      );
      return await html2canvas(target, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#FFFFFF",
        foreignObjectRendering: true,
        onclone: (_clonedDoc: Document, clonedRoot: HTMLElement) => {
          prepareHtml2CanvasClone(_clonedDoc, clonedRoot, target);
          // Tangkapan memakai ukuran desain penuh, bukan ukuran pratinjau.
          const scaler = clonedRoot.closest<HTMLElement>("[data-slide-scaler]");
          if (scaler) {
            scaler.style.transform = "none";
            const viewport = scaler.parentElement;
            if (viewport) {
              viewport.style.width = "auto";
              viewport.style.height = "auto";
            }
          }
        },
      });
    };

    useImperativeHandle(ref, () => ({
      saveAsImage: async (batchName: string, participant: ProfilerPeserta) => {
        const canvas = await captureElementCanvas(slideRef.current);
        if (!canvas) return;
        const modeSuffix =
          slideMode === "portraitA4" ? "opsi2-portrait-a4" : "original";
        const link = document.createElement("a");
        link.download = `${batchName}_${
          participant.nama?.replace(/\s+/g, "_") || "participant"
        }_${modeSuffix}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      },
      saveAsPDF: async (batchName: string, participant: ProfilerPeserta) => {
        const { jsPDF } = await import("jspdf");
        const isA4Portrait = slideMode === "portraitA4";

        const canvas = await captureElementCanvas(slideRef.current);
        if (!canvas) return;

        const pdfFormat: [number, number] = [canvas.width, canvas.height];
        const pdf = new jsPDF({
          orientation: isA4Portrait ? "p" : "l",
          unit: "px",
          format: pdfFormat,
          hotfixes: ["px_scaling"],
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        pdf.addImage(imgData, "JPEG", 0, 0, canvas.width, canvas.height);

        const modeSuffix = isA4Portrait ? "opsi2-portrait-a4" : "original";
        pdf.save(
          `${batchName}_${
            participant.nama?.replace(/\s+/g, "_") || "participant"
          }_${modeSuffix}.pdf`
        );
      },
    }));

    return (
      <div ref={frameRef} className="w-full">
        <div
          className="mx-auto overflow-hidden"
          style={{
            width: design.width * scale,
            height: design.height * scale,
          }}
        >
          <div
            data-slide-scaler
            className="relative origin-top-left transition-opacity duration-300"
            style={{
              width: design.width,
              height: design.height,
              opacity: fade ? 1 : 0,
              transform: `scale(${scale})`,
            }}
          >
            <div
              ref={slideRef}
              className={`bg-surface border border-border flex h-full w-full flex-col rounded-2xl ${
                isA4Portrait ? "overflow-y-auto" : "overflow-hidden"
              }`}
            >
              {children}

              <div className="h-6 shrink-0" />
            </div>
          </div>
        </div>
      </div>
    );
  }
);

SlideCanvas.displayName = "SlideCanvas";
