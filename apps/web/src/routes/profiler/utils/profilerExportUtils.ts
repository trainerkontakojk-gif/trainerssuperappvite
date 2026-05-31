import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { getPhotoFrame } from "../../../lib/photo-frame";
import { hitungMasaDinas, hitungUsia } from "./profilerFormatters";
export { buildSlideHTML } from "./profilerSlideHtml";
export { downloadPPTX } from "./profilerPptxExport";
export { downloadPDF } from "./profilerPdfExport";

export const buildRows = (list: ProfilerPeserta[]) =>
  list.map((p, i) => ({
    No: i + 1,
    Nama: p.nama || "",
    Tim: p.tim || "",
    Jabatan: labelJabatan[p.jabatan || ""] || p.jabatan || "",
    "NIK OJK": p.nik_ojk || "",
    "Email OJK": p.email_ojk || "",
    "No. Telepon": p.no_telepon || "",
    "No. Telepon Darurat": p.no_telepon_darurat || "",
    "Nama Kontak Darurat": p.nama_kontak_darurat || "",
    "Hubungan Kontak Darurat": p.hubungan_kontak_darurat || "",
    Bergabung: p.bergabung_date || "",
    "Masa Dinas": p.bergabung_date ? hitungMasaDinas(p.bergabung_date) : "",
    "Jenis Kelamin": p.jenis_kelamin || "",
    Agama: p.agama || "",
    "Tanggal Lahir": p.tgl_lahir || "",
    Usia: p.tgl_lahir ? `${hitungUsia(p.tgl_lahir)} Tahun` : "",
    "Status Perkawinan": p.status_perkawinan || "",
    Pendidikan: p.pendidikan || "",
    Lembaga: p.nama_lembaga || "",
    Jurusan: p.jurusan || "",
    "No. KTP": p.no_ktp || "",
    "No. NPWP": p.no_npwp || "",
    "No. Rekening": p.nomor_rekening || "",
    Bank: p.nama_bank || "",
    "Status Hunian": p.status_tempat_tinggal || "",
    "Alamat Tinggal": p.alamat_tinggal || "",
    "Previous Company": p.previous_company || "",
    "Pengalaman CC": p.pengalaman_cc || "",
    "Catatan Tambahan": p.catatan_tambahan || "",
    Keterangan: p.keterangan || "",
  }));

export const buildFramedPhotoData = async (
  fotoUrl: string,
  frame: ReturnType<typeof getPhotoFrame>,
  size = 512
): Promise<string | null> => {
  try {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load image"));
      image.src = fotoUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const coverScale = Math.max(size / image.width, size / image.height);
    const scale = coverScale * frame.zoom;
    const drawW = image.width * scale;
    const drawH = image.height * scale;

    const posXRatio = frame.x / 100;
    const posYRatio = frame.y / 100;
    const offsetX = size * posXRatio - drawW * posXRatio;
    const offsetY = size * posYRatio - drawH * posYRatio;

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, offsetX, offsetY, drawW, drawH);
    return canvas.toDataURL("image/jpeg", 0.95);
  } catch {
    return null;
  }
};

export const downloadExcel = async (
  peserta: ProfilerPeserta[],
  selectedBatch: string,
  setGenerating: (val: string | null) => void
) => {
  setGenerating("excel");
  try {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(buildRows(peserta));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Peserta");
    XLSX.writeFile(wb, `${selectedBatch}_peserta.xlsx`);
  } finally {
    setGenerating(null);
  }
};

export const downloadCSV = async (
  peserta: ProfilerPeserta[],
  selectedBatch: string,
  setGenerating: (val: string | null) => void
) => {
  setGenerating("csv");
  try {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(buildRows(peserta));
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedBatch}_peserta.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    setGenerating(null);
  }
};
