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

export function useProfilerExport({ peserta, selectedBatch }: UseProfilerExportProps) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(
    "landscape"
  );

  const disabled = generating !== null || peserta.length === 0;

  const options = [
    {
      id: "excel",
      icon: <FileSpreadsheet className="h-8 w-8 text-green-500" />,
      title: "Excel (.xlsx)",
      desc: "Semua data peserta dalam format spreadsheet",
      action: () => downloadExcel(peserta, selectedBatch, setGenerating),
      hover: "hover:border-green-300 dark:hover:border-green-700",
    },
    {
      id: "csv",
      icon: <FileText className="h-8 w-8 text-blue-500" />,
      title: "CSV (.csv)",
      desc: "Format universal, semua field lengkap",
      action: () => downloadCSV(peserta, selectedBatch, setGenerating),
      hover: "hover:border-blue-300 dark:hover:border-blue-700",
    },
    {
      id: "pptx",
      icon: <Presentation className="h-8 w-8 text-orange-500" />,
      title: "PowerPoint (.pptx)",
      desc: "1 slide per peserta, layout persis SlideView",
      action: () =>
        downloadPPTX(peserta, selectedBatch, orientation, setGenerating),
      hover: "hover:border-orange-300 dark:hover:border-orange-700",
    },
    {
      id: "pdf",
      icon: <FileDown className="h-8 w-8 text-red-500" />,
      title: "PDF (.pdf)",
      desc: "1 halaman per peserta, layout persis SlideView",
      action: () =>
        downloadPDF(peserta, selectedBatch, orientation, setGenerating),
      hover: "hover:border-red-300 dark:hover:border-red-700",
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
