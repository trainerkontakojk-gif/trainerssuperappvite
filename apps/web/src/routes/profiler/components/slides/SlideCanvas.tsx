import React, { useRef, useImperativeHandle, forwardRef } from "react";
import type { ProfilerPeserta } from "@trainers/types";

export type SlideMode = "original" | "portraitA4";

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
    const isA4Portrait = slideMode === "portraitA4";

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
      <div
        className={`relative duration-300 transition-all ${
          isA4Portrait
            ? "aspect-[210/297] w-full max-w-[820px]"
            : "aspect-video max-h-full w-full max-w-[1000px]"
        }`}
        style={{
          opacity: fade ? 1 : 0,
          transform: fade ? "translateY(0)" : "translateY(4px)",
        }}
      >
        <div
          ref={slideRef}
          className={`bg-card border-border/40 flex h-full w-full flex-col rounded-[2rem] border shadow-2xl dark:shadow-black/60 ${
            isA4Portrait ? "overflow-y-auto" : "overflow-hidden"
          }`}
        >
          <div
            className="h-[6px] w-full shrink-0"
            style={{ background: theme.accent }}
          />

          {children}

          <div className="h-6 shrink-0" />
        </div>
      </div>
    );
  }
);

SlideCanvas.displayName = "SlideCanvas";
