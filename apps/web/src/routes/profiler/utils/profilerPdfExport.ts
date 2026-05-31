import type { ProfilerPeserta } from "@trainers/types";
import { buildSlideHTML } from "./profilerSlideHtml";

export const downloadPDF = async (
  peserta: ProfilerPeserta[],
  selectedBatch: string,
  orientation: "landscape" | "portrait",
  setGenerating: (val: string | null) => void
) => {
  setGenerating("pdf");
  try {
    const { jsPDF } = await import("jspdf");
    const html2canvas = (await import("html2canvas")).default;
    const { prepareHtml2CanvasClone } = await import("../../../lib/html2canvas-tailwind-fix");

    const isLandscape = orientation === "landscape";
    const pdfW = isLandscape ? 960 : 600;
    const pdfH = isLandscape ? 540 : 848;

    const pdf = new jsPDF({
      orientation: isLandscape ? "landscape" : "portrait",
      unit: "px",
      format: [pdfW, pdfH],
    });
    for (let i = 0; i < peserta.length; i++) {
      const p = peserta[i];
      const container = document.createElement("div");
      container.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${pdfW}px;height:${pdfH}px;overflow:hidden;z-index:-1;--tw-ring-color:transparent;--tw-shadow:none;`;
      container.innerHTML = buildSlideHTML(p, selectedBatch, orientation);
      document.body.appendChild(container);
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#FFFFFF",
        width: pdfW,
        height: pdfH,
        foreignObjectRendering: true,
        onclone: (_clonedDoc: Document, clonedRoot: HTMLElement) => {
          prepareHtml2CanvasClone(_clonedDoc, clonedRoot, container);
        },
      });
      document.body.removeChild(container);
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);
    }
    pdf.save(`${selectedBatch}_peserta.pdf`);
  } catch (err: any) {
    alert("Gagal membuat PDF: " + err.message);
  } finally {
    setGenerating(null);
  }
};
