import React, { useState } from "react";
import {
  FileSpreadsheet,
  FileText,
  Presentation,
  FileDown,
} from "lucide-react";
import type { ProfilerPeserta } from "@trainers/types";
import {
  downloadCSV,
  downloadExcel,
  downloadPDF,
  downloadPPTX,
} from "../utils/profilerExportUtils";

interface UseProfilerExportProps {
  peserta: ProfilerPeserta[];
  selectedBatch: string;
}

export function useProfilerExport({
  peserta,
  selectedBatch,
}: UseProfilerExportProps) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(
    "landscape",
  );

  const disabled = generating !== null || peserta.length === 0;

  const options = [
    {
      id: "excel",
      icon: <FileSpreadsheet className="h-8 w-8 text-chart-green" />,
      title: "Excel (.xlsx)",
      desc: "Semua data peserta dalam format spreadsheet",
      action: () => downloadExcel(peserta, selectedBatch, setGenerating),
      hover: "hover:border-chart-green/40",
    },
    {
      id: "csv",
      icon: <FileText className="h-8 w-8 text-chart-blue" />,
      title: "CSV (.csv)",
      desc: "Format universal, semua field lengkap",
      action: () => downloadCSV(peserta, selectedBatch, setGenerating),
      hover: "hover:border-chart-blue/40",
    },
    {
      id: "pptx",
      icon: <Presentation className="h-8 w-8 text-chart-orange" />,
      title: "PowerPoint (.pptx)",
      desc: "1 slide per peserta, layout persis SlideView",
      action: () =>
        downloadPPTX(peserta, selectedBatch, orientation, setGenerating),
      hover: "hover:border-chart-orange/40",
    },
    {
      id: "pdf",
      icon: <FileDown className="h-8 w-8 text-destructive" />,
      title: "PDF (.pdf)",
      desc: "1 halaman per peserta, layout persis SlideView",
      action: () =>
        downloadPDF(peserta, selectedBatch, orientation, setGenerating),
      hover: "hover:border-destructive/40",
    },
  ];

  return {
    generating,
    orientation,
    setOrientation,
    options,
    disabled,
  };
}
