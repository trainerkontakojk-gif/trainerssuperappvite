import { useState, useCallback } from "react";
import { sidakClient, unwrapResponse } from "../../../lib/api";
import {
  formatQAIndicatorName,
  tanggalSchema,
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
        // Dua kolom baru ditaruh DI BELAKANG lima kolom lama supaya template
        // lama tetap terbaca dan tidak perlu diunduh ulang.
        { key: "tglLayanan", header: "Tanggal Layanan (YYYY-MM-DD)", width: 24 },
        { key: "tglSampel", header: "Tanggal Sampel (YYYY-MM-DD)", width: 24 },
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

      // Petunjuk ditaruh di sheet TERPISAH ("Petunjuk") yang tetap terlihat,
      // BUKAN sebagai baris di "Input Temuan". Parser membaca setiap baris yang
      // tidak kosong sebagai baris data, jadi catatan di sheet yang sama membuat
      // template hasil unduhan menghasilkan baris error "Parameter kosong" dan
      // alur kanonik download → isi → upload gagal. Sheet terpisah menjaga
      // "Input Temuan" tetap kolom-eksak 7 kolom dan bebas baris non-data.
      const help = wb.addWorksheet("Petunjuk");
      help.getColumn(1).width = 96;
      help.getCell("A1").value =
        "Kolom Tanggal Layanan dan Tanggal Sampel OPSIONAL — boleh dikosongkan.";
      help.getCell("A2").value =
        "Kosong berarti tanggal belum diisi, bukan tidak berlaku. Format: YYYY-MM-DD.";
      help.getCell("A3").value =
        'Isi hanya baris pada sheet "Input Temuan". Baris contoh boleh diubah atau dihapus.';
      help.getCell("A1").font = { italic: true, size: 10 };

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
      const { readWorkbookRawValues, toDateOnlyUTC } = await import(
        "../../../lib/excel-utils"
      );
      const buffer = await file.arrayBuffer();
      const { names, sheets } = await readWorkbookRawValues(buffer);
      const sheetName = names.find((n) => n === "Input Temuan") ?? names[0];
      const rows = sheets[sheetName] ?? [];

      /**
       * Kolom dibaca berdasarkan HEADER, bukan posisi. Template lima kolom lama
       * tidak punya kolom tanggal sama sekali, jadi indeks posisi akan membuat
       * kolom `Sebaiknya` terbaca sebagai tanggal.
       */
      const headerRow = (rows[0] ?? []).map((c) =>
        String(c ?? "").trim().toLowerCase(),
      );
      const colOf = (header: string) => headerRow.indexOf(header);
      const colTiket = colOf("no. tiket");
      const colParam = colOf("parameter / sub-parameter");
      const colNilai = colOf("nilai (0-3)");
      const colKtdk = colOf("ketidaksesuaian");
      const colSbk = colOf("sebaiknya");
      const colTglLayanan = colOf("tanggal layanan (yyyy-mm-dd)");
      const colTglSampel = colOf("tanggal sampel (yyyy-mm-dd)");

      const cellAt = (row: unknown[], index: number): unknown =>
        index >= 0 ? row[index] : undefined;

      /**
       * Terjemahkan sel tanggal menjadi `YYYY-MM-DD`, atau null bila kosong.
       *
       * - `Date` (sel Excel berformat tanggal) -> getter UTC, tanpa pergeseran.
       * - teks harus ISO DAN tanggal kalender nyata (divalidasi `tanggalSchema`,
       *   jadi `2026-02-30` dan `03/04/2026` ditolak).
       * - angka TIDAK ditebak sebagai serial Excel; formatnya ambigu.
       */
      const readTanggal = (
        row: unknown[],
        index: number,
        label: string,
      ): { value: string | null; error: string } => {
        const raw = cellAt(row, index);
        if (raw === null || raw === undefined || raw === "") {
          return { value: null, error: "" };
        }
        const fromExcel = toDateOnlyUTC(raw);
        const text = fromExcel ?? (typeof raw === "string" ? raw.trim() : "");
        if (!text) {
          if (typeof raw === "number") {
            return {
              value: null,
              error: `${label} diisi angka (${raw}) — format tanggal tidak bisa dipastikan. Gunakan teks YYYY-MM-DD.`,
            };
          }
          return { value: null, error: `${label} tidak valid.` };
        }
        const parsed = tanggalSchema.safeParse(text);
        if (!parsed.success) {
          return {
            value: null,
            error: `${label} "${text}" tidak valid. Gunakan YYYY-MM-DD dengan tanggal yang nyata.`,
          };
        }
        return { value: text, error: "" };
      };
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
        const no_tiket = String(cellAt(row, colTiket) ?? "").trim();
        const paramName = String(cellAt(row, colParam) ?? "").trim();
        const nilaiRaw = cellAt(row, colNilai);
        const ketidaksesuaian = String(cellAt(row, colKtdk) ?? "").trim();
        const sebaiknya = String(cellAt(row, colSbk) ?? "").trim();
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

        const tglLayanan = readTanggal(row, colTglLayanan, "Tanggal Layanan");
        const tglSampel = readTanggal(row, colTglSampel, "Tanggal Sampel");
        // Tanggal salah memblokir import (tidak dikosongkan diam-diam), tapi
        // error tanggal tidak menimpa error kolom lain.
        if (tglLayanan.error || tglSampel.error) {
          error = error || tglLayanan.error || tglSampel.error;
        }

        result.push({
          rowNum: i + 1,
          no_tiket,
          paramName,
          indicator_id,
          nilai,
          ketidaksesuaian,
          sebaiknya,
          tanggal_layanan: tglLayanan.value,
          tanggal_sampel: tglSampel.value,
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
        // String kosong tidak mungkin muncul di sini: `readTanggal` sudah
        // mengubahnya menjadi `null`, jadi backend menerima tanggal nyata atau
        // tidak mengirim apa pun.
        tanggal_layanan: r.tanggal_layanan || null,
        tanggal_sampel: r.tanggal_sampel || null,
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
