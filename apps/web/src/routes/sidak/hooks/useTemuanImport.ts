import { useState, useCallback } from "react";
import { sidakClient, unwrapResponse } from "../../../lib/api";
import {
  formatQAIndicatorName,
  type QAIndicator,
  type QAPeriod,
  type QATemuan,
} from "@trainers/types";
import type { ParsedImportRow as ImportRowType } from "../../../components/sidak/SidakInputImportPanel";

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

interface AgentEntry {
  id: string;
  nama: string;
  batch_name?: string | null;
  tim?: string | null;
  jabatan?: string | null;
}

interface UseTemuanImportParams {
  selectedAgent: AgentEntry | null;
  selectedPeriod: QAPeriod | null;
  selectedService: string;
  activeIndicators: QAIndicator[];
  unlinkedIndicatorIds: Set<string>;
  temuan: QATemuan[];
  setTemuan: React.Dispatch<React.SetStateAction<QATemuan[]>>;
  setErrorMsg: (msg: string | null) => void;
  setSuccessMsg: (msg: string | null) => void;
}

interface TemuanBatchPreview {
  stats: {
    invalid_count: number;
    skipped_count: number;
    valid_count: number;
  };
}

export function useTemuanImport({
  selectedAgent,
  selectedPeriod,
  selectedService,
  activeIndicators,
  unlinkedIndicatorIds,
  temuan: _temuan,
  setTemuan,
  setErrorMsg,
  setSuccessMsg,
}: UseTemuanImportParams) {
  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState<"download" | "upload">("download");
  const [importRows, setImportRows] = useState<ImportRowType[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);

  const handleImportClose = useCallback(() => {
    setShowImport(false);
    setImportRows([]);
    setImportFile(null);
  }, []);

  const handleDownloadTemplate = async () => {
    if (activeIndicators.length === 0 || !selectedAgent || !selectedPeriod)
      return;
    setGeneratingTemplate(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "SIDAK";
      wb.created = new Date();

      const HEADER_FILL: any = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF7C3AED" },
      };
      const HEADER_FONT: any = {
        bold: true,
        color: { argb: "FFFFFFFF" },
        size: 11,
      };

      const wsParams = wb.addWorksheet("_Params");
      wsParams.state = "veryHidden";
      activeIndicators.forEach((ind, i) => {
        wsParams.getCell(`A${i + 1}`).value = formatQAIndicatorName(ind);
      });

      const ws = wb.addWorksheet("Input Temuan");
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.columns = [
        { key: "tiket", header: "No. Tiket", width: 18 },
        { key: "param", header: "Parameter / Sub-parameter", width: 64 },
        { key: "nilai", header: "Nilai (0-3)", width: 13 },
        { key: "ktdk", header: "Ketidaksesuaian", width: 42 },
        { key: "sbknya", header: "Sebaiknya", width: 42 },
      ];
      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell: any) => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      activeIndicators.slice(0, 3).forEach((ind, i) => {
        ws.addRow({
          tiket: `L${selectedPeriod.year}${String(selectedPeriod.month).padStart(2, "0")}${String(i + 1).padStart(2, "0")}`,
          param: formatQAIndicatorName(ind),
          nilai: i === 0 ? 2 : i === 1 ? 1 : 0,
          ktdk: i === 0 ? "Contoh ketidaksesuaian" : "",
          sbknya: i === 0 ? "Contoh perbaikan" : "",
        });
      });

      const paramCount = activeIndicators.length;
      for (let r = 2; r <= 101; r++) {
        ws.getCell(`B${r}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`_Params!$A$1:$A$${paramCount}`],
        };
        ws.getCell(`C${r}`).dataValidation = {
          type: "whole",
          operator: "between",
          allowBlank: true,
          formulae: [0, 3],
        };
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Template_SIDAK_${selectedAgent.nama.replace(/\s/g, "_")}_${MONTHS[selectedPeriod.month - 1]}_${selectedPeriod.year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMsg("Gagal membuat template Excel.");
    } finally {
      setGeneratingTemplate(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || activeIndicators.length === 0) return;
    if (file.name.toLowerCase().endsWith(".xls")) {
      setErrorMsg(
        "Format .xls tidak didukung. Simpan ulang sebagai .xlsx lalu impor kembali.",
      );
      return;
    }
    setImportFile(file);
    setParsing(true);
    try {
      const { readWorkbookRaw } = await import("../../../lib/excel-utils");
      const buffer = await file.arrayBuffer();
      const { names, sheets } = await readWorkbookRaw(buffer);
      const sheetName = names.find((n) => n === "Input Temuan") ?? names[0];
      const rows = sheets[sheetName] ?? [];
      const paramMap = new Map(
        activeIndicators.map((indicator) => [
          formatQAIndicatorName(indicator).toLowerCase().trim(),
          indicator,
        ]),
      );
      const result: ImportRowType[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.every((c) => c === "" || c === null || c === undefined))
          continue;
        const no_tiket = String(row[0] ?? "").trim();
        const paramName = String(row[1] ?? "").trim();
        const nilaiRaw = row[2];
        const ketidaksesuaian = String(row[3] ?? "").trim();
        const sebaiknya = String(row[4] ?? "").trim();
        let error = "";
        let indicator_id: string | null = null;
        let nilai: number | null = null;

        const matched = paramMap.get(paramName.toLowerCase());
        if (!paramName) error = "Parameter kosong";
        else if (!matched)
          error = `Parameter "${paramName}" tidak dikenali`;
        else indicator_id = matched.id;

        const nilaiNum = Number(nilaiRaw);
        if (
          nilaiRaw === "" ||
          nilaiRaw === null ||
          nilaiRaw === undefined
        ) {
          nilai = 3;
        } else if (isNaN(nilaiNum) || ![0, 1, 2, 3].includes(nilaiNum)) {
          error = `Nilai "${nilaiRaw}" tidak valid (harus 0-3)`;
        } else {
          nilai = nilaiNum;
        }

        result.push({
          rowNum: i + 1,
          no_tiket,
          paramName,
          indicator_id,
          nilai,
          ketidaksesuaian,
          sebaiknya,
          error,
        });
      }

      setImportRows(result);
      setImportTab("upload");
    } catch {
      setErrorMsg("Gagal membaca file Excel.");
    } finally {
      setParsing(false);
    }
  };

  const handleImportSave = async () => {
    if (!selectedAgent || !selectedPeriod || importRows.length === 0) return;
    const invalid = importRows.filter((r) => r.error);
    if (invalid.length > 0) {
      setErrorMsg(
        "Terdapat baris dengan error. Perbaiki semua error terlebih dahulu.",
      );
      return;
    }
    if (importRows.some((r) => !r.indicator_id)) {
      setErrorMsg("Terdapat baris dengan parameter tidak valid.");
      return;
    }
    if (
      unlinkedIndicatorIds.size > 0 &&
      importRows.some(
        (r) => r.indicator_id && unlinkedIndicatorIds.has(r.indicator_id),
      )
    ) {
      setErrorMsg(
        "Terdapat parameter yang belum terhubung ke database global. Gunakan parameter yang sudah dilink di halaman Settings QA.",
      );
      return;
    }
    setImporting(true);
    setErrorMsg(null);
    try {
      const valid = importRows.filter(
        (r) => !r.error && r.indicator_id && r.nilai !== null,
      );
      const importItems = valid.map((r) => ({
        indicator_id: r.indicator_id!,
        nilai: r.nilai!,
        ketidaksesuaian: r.ketidaksesuaian || null,
        sebaiknya: r.sebaiknya || null,
        no_tiket: r.no_tiket || null,
      }));
      const preview = (await unwrapResponse(
        await sidakClient.temuan.batch.preview.$post({
          json: {
            peserta_id: selectedAgent.id,
            period_id: selectedPeriod.id,
            service_type: selectedService,
            items: importItems,
          },
        }),
      )) as TemuanBatchPreview;
      if (preview.stats.invalid_count > 0) {
        setErrorMsg(
          `${preview.stats.invalid_count} parameter tidak valid di server. Periksa kembali data import.`,
        );
        return;
      }
      if (preview.stats.skipped_count > 0) {
        const ok = window.confirm(
          `${preview.stats.skipped_count} baris sudah ada (duplikat) dan akan di-skip. ${preview.stats.valid_count} akan diimport. Lanjutkan?`,
        );
        if (!ok) return;
      }
      const created = (await unwrapResponse(
        await sidakClient.temuan.batch.$post({
          json: {
            peserta_id: selectedAgent.id,
            period_id: selectedPeriod.id,
            service_type: selectedService,
            items: importItems,
          },
        }),
      )) as { inserted: number; skipped: number; total: number };
      const updated = (await unwrapResponse(
        await sidakClient.temuan.$get({
          query: {
            peserta_id: selectedAgent.id,
            period_id: selectedPeriod.id,
            service_type: selectedService,
            limit: "200",
          },
        }),
      )) as { items: QATemuan[]; total: number };
      setTemuan(updated.items ?? []);
      setShowImport(false);
      setImportRows([]);
      setSuccessMsg(`${created?.inserted ?? 0} temuan berhasil diimport!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e: any) {
      setErrorMsg(e.message || "Gagal mengimport temuan");
    } finally {
      setImporting(false);
    }
  };

  return {
    showImport,
    setShowImport,
    importTab,
    setImportTab,
    importRows,
    setImportRows,
    importFile,
    setImportFile,
    importing,
    setImporting,
    parsing,
    setParsing,
    generatingTemplate,
    setGeneratingTemplate,
    handleDownloadTemplate,
    handleFileUpload,
    handleImportSave,
    handleImportClose,
  };
}
