import { formatQAIndicatorName, type QAIndicator } from "@trainers/types";

const TEMPLATE_COLUMNS = [
  { header: "No Tiket", key: "no_tiket", width: 20 },
  { header: "Indikator", key: "indicator_name", width: 40 },
  { header: "Nilai (0-3)", key: "nilai", width: 15 },
  { header: "Ketidaksesuaian", key: "ketidaksesuaian", width: 50 },
  { header: "Sebaiknya", key: "sebaiknya", width: 50 },
];

export async function generateTemplate(
  indicators: QAIndicator[],
  serviceType: string,
): Promise<ArrayBuffer> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.default.Workbook();
  const ws = wb.addWorksheet("Input Temuan");
  const refSheet = wb.addWorksheet("_indikator", { state: "hidden" });

  const filtered = indicators.filter((i) => i.service_type === serviceType);
  refSheet.getColumn("A").values = [
    "Indikator",
    ...filtered.map((i) => formatQAIndicatorName(i)),
  ];

  ws.columns = TEMPLATE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  ws.addRow({
    no_tiket: "",
    indicator_name: "",
    nilai: "",
    ketidaksesuaian: "",
    sebaiknya: "",
  });
  ws.addRow({
    no_tiket: "CONTOH-001",
    indicator_name: filtered[0] ? formatQAIndicatorName(filtered[0]) : "",
    nilai: 2,
    ketidaksesuaian: "Tidak menyebutkan nama",
    sebaiknya: "Menyebutkan nama sesuai SOP",
  });

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });

  for (let i = 2; i <= 100; i++) {
    ws.getCell(`B${i}`).dataValidation = {
      type: "list",
      formulae: [`_indikator!$A$2:$A${filtered.length + 1}`],
      showErrorMessage: true,
      errorTitle: "Indikator tidak valid",
      error: "Pilih indikator dari dropdown yang tersedia.",
    };
    ws.getCell(`C${i}`).dataValidation = {
      type: "list",
      formulae: ["0,1,2,3"],
      showErrorMessage: true,
      errorTitle: "Nilai tidak valid",
      error: "Nilai harus 0, 1, 2, atau 3.",
    };
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

export interface ParsedRow {
  row: number;
  no_tiket: string;
  indicator_name: string;
  nilai: number;
  ketidaksesuaian: string;
  sebaiknya: string;
  indicator_id?: string;
  service_type?: string;
  error?: string;
}

export interface RawWorkbook {
  names: string[];
  /** sheet name -> grid of cell text; rows and columns are 0-indexed here */
  sheets: Record<string, string[][]>;
}

/** Normalize any ExcelJS CellValue (primitive, Date, rich text, formula result) to plain text. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as { text?: string }[])
        .map((part) => part?.text ?? "")
        .join("");
    }
    if (obj.result !== undefined && obj.result !== null)
      return cellText(obj.result);
  }
  return "";
}

/**
 * Read any .xlsx workbook into a plain text grid using ExcelJS.
 * Single reading path for the whole app (replaces the frozen `xlsx` package).
 */
export async function readWorkbookRaw(data: ArrayBuffer): Promise<RawWorkbook> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const names: string[] = [];
  const sheets: Record<string, string[][]> = {};
  wb.eachSheet((ws) => {
    names.push(ws.name);
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= Math.max(row.cellCount, 1); c++) {
        cells.push(cellText(row.getCell(c).value));
      }
      rows.push(cells);
    });
    sheets[ws.name] = rows;
  });
  return { names, sheets };
}

/** Build an .xlsx buffer from flat row objects (header = first object's keys, order preserved). */
export async function buildFlatWorkbookBuffer(
  sheetName: string,
  rows: Record<string, unknown>[],
): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  if (headers.length > 0) {
    ws.addRow(headers);
    for (const r of rows) ws.addRow(headers.map((k) => r[k] ?? ""));
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Build + download an .xlsx file from flat row objects. */
export async function writeFlatExcel(
  sheetName: string,
  rows: Record<string, unknown>[],
  fileName: string,
): Promise<void> {
  const buffer = await buildFlatWorkbookBuffer(sheetName, rows);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Escape a single CSV field (quotes fields containing comma, quote or newline). */
function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize flat row objects to RFC-4180-ish CSV (CRLF line endings). */
export function toCsv(rows: Record<string, unknown>[]): string {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) lines.push(headers.map((k) => csvEscape(r[k])).join(","));
  return lines.join("\r\n");
}

/** Minimal RFC-4180 CSV parser: quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") pushField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else field += ch;
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

const XLS_UNSUPPORTED_MESSAGE =
  "Format .xls tidak didukung. Simpan ulang sebagai .xlsx lalu impor kembali.";

export function parseExcel(
  file: File,
  indicators: QAIndicator[],
  serviceType?: string,
): Promise<ParsedRow[]> {
  if (file.name.toLowerCase().endsWith(".xls")) {
    return Promise.reject(new Error(XLS_UNSUPPORTED_MESSAGE));
  }
  return (async () => {
    const buffer = await file.arrayBuffer();
    const { names, sheets } = await readWorkbookRaw(buffer);
    const sheetName = names.find((n) => n === "Input Temuan") ?? names[0];
    const table = sheets[sheetName] ?? [];

    // Header = first row; map known header names to column indexes,
    // falling back to the template's positional order (0..4).
    const header = (table[0] ?? []).map((h) => String(h ?? "").trim());
    const colIndexFor = (canonical: string[], fallbackIdx: number) => {
      const found = header.findIndex((h) =>
        canonical.some((c) => h.toLowerCase() === c.toLowerCase()),
      );
      return found >= 0 ? found : fallbackIdx;
    };
    const idxTiket = colIndexFor(["No Tiket"], 0);
    const idxIndicator = colIndexFor(["Indikator"], 1);
    const idxNilai = colIndexFor(["Nilai (0-3)"], 2);
    const idxKtdk = colIndexFor(["Ketidaksesuaian"], 3);
    const idxSbknya = colIndexFor(["Sebaiknya"], 4);

    const filtered = serviceType
      ? indicators.filter((i) => i.service_type === serviceType)
      : indicators;
    const indicatorMap = new Map(
      filtered.map((indicator) => [
        formatQAIndicatorName(indicator).toLowerCase(),
        indicator,
      ]),
    );

    const result: ParsedRow[] = [];
    for (let i = 1; i < table.length; i++) {
      const row = table[i];
      // xlsx's sheet_to_json silently omitted blank rows; keep that behavior.
      if (row.every((c) => c === "" || c === null || c === undefined))
        continue;
      const parsed: ParsedRow = {
        row: i + 1,
        no_tiket: String(row[idxTiket] ?? "")
          .trim()
          .replace(/^"|"$/g, ""),
        indicator_name: String(row[idxIndicator] ?? "")
          .trim()
          .replace(/^"|"$/g, ""),
        nilai: parseInt(String(row[idxNilai] ?? "") || "-1", 10),
        ketidaksesuaian: String(row[idxKtdk] ?? "")
          .trim()
          .replace(/^"|"$/g, ""),
        sebaiknya: String(row[idxSbknya] ?? "")
          .trim()
          .replace(/^"|"$/g, ""),
        service_type: serviceType || undefined,
      };

      const errors: string[] = [];
      if (!parsed.no_tiket) errors.push("No Tiket kosong");
      if (!parsed.indicator_name) errors.push("Indikator kosong");
      if (isNaN(parsed.nilai) || parsed.nilai < 0 || parsed.nilai > 3)
        errors.push("Nilai harus 0-3");

      const matched = indicatorMap.get(parsed.indicator_name.toLowerCase());
      if (matched) {
        parsed.indicator_id = matched.id;
      } else if (parsed.indicator_name) {
        errors.push(`Indikator "${parsed.indicator_name}" tidak ditemukan`);
      }

      if (errors.length > 0) parsed.error = errors.join("; ");
      result.push(parsed);
    }
    return result;
  })();
}

export function validateImportRows(rows: ParsedRow[]): {
  valid: ParsedRow[];
  invalid: ParsedRow[];
} {
  const valid: ParsedRow[] = [];
  const invalid: ParsedRow[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.error) {
      invalid.push(row);
      continue;
    }
    const key = `${row.no_tiket}|${row.indicator_id}|${row.service_type ?? ""}`;
    if (seen.has(key)) {
      invalid.push({
        ...row,
        error: `Duplikat: kombinasi tiket "${row.no_tiket}" + indikator + service sudah ada`,
      });
      continue;
    }
    seen.add(key);
    valid.push(row);
  }

  return { valid, invalid };
}

export async function generateProfilerTemplate(
  batchName: string,
  timList: string[],
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  // 1. Sheet Data Peserta
  const sheet = workbook.addWorksheet("Data Peserta");

  // Header Configuration
  const columns = [
    { header: "Nama Lengkap*", key: "nama", width: 30 },
    { header: "Tim*", key: "tim", width: 20 },
    { header: "Jabatan*", key: "jabatan", width: 20 },
    { header: "NIP OJK", key: "nip_ojk", width: 15 },
    { header: "Tgl Bergabung (YYYY-MM-DD)", key: "bergabung_date", width: 25 },
    { header: "Email OJK", key: "email_ojk", width: 25 },
    { header: "No Telepon", key: "no_telepon", width: 20 },
    { header: "No Telp Darurat", key: "no_telepon_darurat", width: 20 },
    { header: "Nama Kontak Darurat", key: "nama_kontak_darurat", width: 25 },
    { header: "Hubungan Kontak*", key: "hubungan_kontak_darurat", width: 20 },
    { header: "Jenis Kelamin*", key: "jenis_kelamin", width: 15 },
    { header: "Agama*", key: "agama", width: 15 },
    { header: "Tgl Lahir (YYYY-MM-DD)", key: "tgl_lahir", width: 25 },
    { header: "Status Perkawinan*", key: "status_perkawinan", width: 20 },
    { header: "Pendidikan*", key: "pendidikan", width: 15 },
    { header: "No KTP", key: "no_ktp", width: 20 },
    { header: "No NPWP", key: "no_npwp", width: 20 },
    { header: "No Rekening", key: "nomor_rekening", width: 20 },
    { header: "Nama Bank", key: "nama_bank", width: 20 },
    { header: "Alamat Tinggal", key: "alamat_tinggal", width: 40 },
    { header: "Status Hunian*", key: "status_tempat_tinggal", width: 20 },
    { header: "Nama Lembaga", key: "nama_lembaga", width: 30 },
    { header: "Jurusan", key: "jurusan", width: 25 },
    { header: "Perusahaan Sebelumnya", key: "previous_company", width: 30 },
    { header: "Pengalaman CC*", key: "pengalaman_cc", width: 15 },
    { header: "Catatan Tambahan", key: "catatan_tambahan", width: 40 },
    { header: "Keterangan", key: "keterangan", width: 40 },
  ];

  sheet.columns = columns;

  // Styling Header
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).eachCell((cell, _colNumber) => {
    const headerText = cell.value as string;
    const isRequired = headerText.includes("*");
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isRequired ? "FF15803D" : "FF1E40AF" }, // Green for required, Blue for optional
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  // 2. Sheet Pilihan (Hidden)
  const choiceSheet = workbook.addWorksheet("_Pilihan");

  const labelJabatan = {
    cca: "Contact Center Agent (157)",
    tl: "Team Leader",
    qa: "Quality Assurance",
    spv: "Supervisor",
  };
  const choices = {
    tim: timList,
    jabatan: Object.values(labelJabatan),
    hubungan: ["Orang Tua", "Saudara", "Pasangan", "Teman"],
    gender: ["Laki-laki", "Perempuan"],
    agama: ["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu"],
    statusKawin: ["Belum Menikah", "Menikah", "Cerai"],
    pendidikan: ["SMA", "D3", "S1", "S2", "S3"],
    hunian: ["Milik Sendiri", "Milik Orang Tua", "Kost/Sewa", "Lainnya"],
    pengalaman: ["Pernah", "Tidak Pernah"],
  };

  // Fill choice sheet
  Object.entries(choices).forEach(([key, values], idx) => {
    const col = idx + 1;
    choiceSheet.getCell(1, col).value = key;
    values.forEach((val, rowIdx) => {
      choiceSheet.getCell(rowIdx + 2, col).value = val;
    });
  });

  // Hide choice sheet
  choiceSheet.state = "veryHidden";

  // 3. Apply Data Validations to Data Sheet (1000 rows)
  const getRange = (colIdx: number, count: number) => {
    const colLetter = String.fromCharCode(64 + colIdx);
    return `_Pilihan!$${colLetter}$2:$${colLetter}$${count + 1}`;
  };

  for (let i = 2; i <= 1000; i++) {
    const row = sheet.getRow(i);

    row.getCell(2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [getRange(1, choices.tim.length)],
    };
    row.getCell(3).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [getRange(2, choices.jabatan.length)],
    };
    row.getCell(10).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [getRange(3, choices.hubungan.length)],
    };
    row.getCell(11).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [getRange(4, choices.gender.length)],
    };
    row.getCell(12).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [getRange(5, choices.agama.length)],
    };
    row.getCell(14).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [getRange(6, choices.statusKawin.length)],
    };
    row.getCell(15).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [getRange(7, choices.pendidikan.length)],
    };
    row.getCell(21).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [getRange(8, choices.hunian.length)],
    };
    row.getCell(25).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [getRange(9, choices.pengalaman.length)],
    };
  }

  // 4. Panduan Sheet
  const guideSheet = workbook.addWorksheet("Panduan");
  guideSheet.columns = [{ width: 5 }, { width: 40 }, { width: 60 }];
  guideSheet.addRow(["No", "Kolom", "Keterangan"]);
  guideSheet.getRow(1).font = { bold: true };
  guideSheet.addRows([
    [1, "Nama Lengkap", "Wajib diisi. Nama sesuai KTP."],
    [2, "Tim", "Pilih dari dropdown."],
    [3, "Jabatan", "Pilih dari dropdown."],
    [4, "Tgl Bergabung / Lahir", "Format YYYY-MM-DD (Contoh: 1995-08-17)."],
    [5, "NIP OJK", "Nomor Induk Pegawai OJK (jika ada)."],
    [
      6,
      "Data Sensitif",
      "KTP, NPWP, Rekening bersifat opsional namun disarankan.",
    ],
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Template_Profiler_${batchName.replace(/\s+/g, "_")}.xlsx`;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
