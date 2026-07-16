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

export function parseExcel(
  file: File,
  indicators: QAIndicator[],
  serviceType?: string,
): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx");
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheetName =
          wb.SheetNames.find((n) => n === "Input Temuan") || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

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
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const parsed: ParsedRow = {
            row: i + 2,
            no_tiket: String(row["No Tiket"] || row["no_tiket"] || "").trim(),
            indicator_name: String(
              row["Indikator"] ||
                row["indicator_name"] ||
                row["indicator_name"] ||
                "",
            ).trim(),
            nilai: parseInt(row["Nilai (0-3)"] || row["nilai"] || "-1", 10),
            ketidaksesuaian: String(
              row["Ketidaksesuaian"] || row["ketidaksesuaian"] || "",
            ).trim(),
            sebaiknya: String(
              row["Sebaiknya"] || row["sebaiknya"] || "",
            ).trim(),
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
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
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
