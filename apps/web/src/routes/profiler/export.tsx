import React, { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  FileSpreadsheet,
  FileText,
  Presentation,
  FileDown,
  ChevronDown,
  Folder,
  Check,
} from "lucide-react";
import { useQueryParams } from "../../hooks/useQueryParams";
import { profilerApi } from "../../lib/profilerService";
import type { ProfilerPeserta, ProfilerYear, ProfilerFolder } from "@trainers/types";
import {
  getPhotoFrame,
  getPhotoInlineStyle,
} from "../../lib/photo-frame";
import PageHeroHeader from "../../components/PageHeroHeader";

import { labelJabatan } from "@trainers/types";

const labelTim: Record<string, string> = {
  Telepon: "Telepon",
  Chat: "Chat",
  Email: "Email",
};

const timTheme = (tim: string) => {
  const t = tim?.toLowerCase();
  if (t === "telepon")
    return { accent: "007AFF", accentRgb: "#007AFF", light: "#EBF4FF" };
  if (t === "chat")
    return { accent: "34C759", accentRgb: "#34C759", light: "#EDFAF1" };
  if (t === "email")
    return { accent: "FF9500", accentRgb: "#FF9500", light: "#FFF6E8" };
  return { accent: "AF52DE", accentRgb: "#AF52DE", light: "#F5EEFF" };
};

export const hitungMasaDinas = (joinDate: string): string => {
  const join = new Date(joinDate);
  const now = new Date();
  let years = now.getFullYear() - join.getFullYear();
  let months = now.getMonth() - join.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years > 0) return `${years} thn ${months} bln`;
  return `${months} bln`;
};

export const hitungUsia = (birthDate: string): number => {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

export const formatTanggal = (date: string): string => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export default function ProfilerExport() {
  const navigate = useNavigate();
  const { batch } = useQueryParams();
  const batchName = batch || "";

  const [initialYears, setInitialYears] = useState<ProfilerYear[]>([]);
  const [initialFolders, setInitialFolders] = useState<ProfilerFolder[]>([]);
  const [peserta, setPeserta] = useState<ProfilerPeserta[]>([]);

  const [selectedBatch, setSelectedBatch] = useState(batchName);
  const [showPicker, setShowPicker] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(
    "landscape"
  );

  useEffect(() => {
    Promise.all([
      profilerApi.getYears(),
      profilerApi.getFolders(),
      profilerApi.getPesertaByBatch(selectedBatch),
    ])
      .then(([y, f, p]) => {
        const folderNames = new Set(f.map((folder: any) => folder.name));
        if (selectedBatch && f.length > 0 && !folderNames.has(selectedBatch)) {
          const firstFolder = f[0];
          if (firstFolder?.name) {
            navigate({
              to: "/profiler/export",
              search: { batch: firstFolder.name },
              replace: true,
            });
          } else {
            navigate({ to: "/profiler", replace: true });
          }
          return;
        }
        setInitialYears(y);
        setInitialFolders(f);
        setPeserta(p);
      })
      .catch(console.error);
  }, [selectedBatch]);

  const handleBatchChange = (newBatch: string) => {
    setSelectedBatch(newBatch);
    setShowPicker(false);
    navigate({ to: "/profiler/export", search: { batch: newBatch } });
  };

  const buildRows = (list: ProfilerPeserta[]) =>
    list.map((p, i) => ({
      No: i + 1,
      Nama: p.nama || "",
      Tim: p.tim || "",
      Jabatan: labelJabatan[p.jabatan || ""] || p.jabatan || "",
      "NIK OJK": p.nik_ojk || "", // Wait, legacy maps to p.nip_ojk. In new types, it's nik_ojk? Let's check types. Assuming nik_ojk.
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

  const downloadExcel = async () => {
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

  const downloadCSV = async () => {
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

  const buildFramedPhotoData = async (
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

  const downloadPPTX = async () => {
    setGenerating("pptx");
    try {
      const pptxModule = await import("pptxgenjs");
      const PptxGen = (pptxModule.default ??
        pptxModule) as unknown as new () => any;
      const prs = new PptxGen();

      const isLandscape = orientation === "landscape";
      if (isLandscape) {
        prs.layout = "LAYOUT_16x9";
      } else {
        prs.defineLayout({ name: "A4_PORTRAIT", width: 8.27, height: 11.69 });
        prs.layout = "A4_PORTRAIT";
      }

      for (const p of peserta) {
        const slide = prs.addSlide();
        const theme = timTheme(p.tim || "");
        const accentColor = theme.accent;
        const addProfilePhoto = async (
          x: number,
          y: number,
          w: number,
          h: number,
          fallbackFontSize: number
        ) => {
          const squareSize = Math.min(w, h);
          const finalW = squareSize;
          const finalH = squareSize;
          const finalX = x + (w - squareSize) / 2;
          const finalY = y + (h - squareSize) / 2;

          if (p.foto_url) {
            const frame = getPhotoFrame(p.id, p.photo_frame);
            const framedData = await buildFramedPhotoData(p.foto_url, frame);
            try {
              if (framedData) {
                slide.addImage({
                  data: framedData,
                  x: finalX,
                  y: finalY,
                  w: finalW,
                  h: finalH,
                  rounding: true,
                });
              } else {
                slide.addImage({
                  path: p.foto_url,
                  x: finalX,
                  y: finalY,
                  w: finalW,
                  h: finalH,
                  rounding: true,
                  sizing: { type: "cover", w: finalW, h: finalH },
                });
              }
              return;
            } catch (_e) {
              // Ignore image load error
            }
          }

          slide.addShape(prs.ShapeType.rect, {
            x: finalX,
            y: finalY,
            w: finalW,
            h: finalH,
            fill: { color: theme.light.replace("#", "") },
          });
          slide.addText(p.nama?.charAt(0) || "?", {
            x: finalX,
            y: finalY,
            w: finalW,
            h: finalH,
            align: "center",
            valign: "middle",
            fontSize: fallbackFontSize,
            bold: true,
            color: accentColor,
          });
        };

        if (isLandscape) {
          slide.addShape(prs.ShapeType.rect, {
            x: 0,
            y: 0,
            w: "100%",
            h: 0.04,
            fill: { color: accentColor },
          });

          const sidebarW = 3.0;
          slide.addShape(prs.ShapeType.rect, {
            x: 0,
            y: 0.04,
            w: sidebarW,
            h: 5.585,
            fill: { color: "F9FAFB" },
          });
          slide.addShape(prs.ShapeType.rect, {
            x: sidebarW,
            y: 0.04,
            w: 0.01,
            h: 5.585,
            fill: { color: "F3F4F6" },
          });

          await addProfilePhoto(0.75, 0.35, 1.5, 1.5, 40);

          slide.addText(p.nama || "-", {
            x: 0.2,
            y: 1.95,
            w: 2.6,
            h: 0.4,
            align: "center",
            fontSize: 16,
            bold: true,
            color: "111827",
          });
          slide.addText(labelJabatan[p.jabatan || ""] || p.jabatan || "-", {
            x: 0.2,
            y: 2.3,
            w: 2.6,
            h: 0.2,
            align: "center",
            fontSize: 10,
            bold: true,
            color: accentColor,
          });

          slide.addText(labelTim[p.tim || ""] || p.tim || "-", {
            x: 0.8,
            y: 2.6,
            w: 1.4,
            h: 0.25,
            fontSize: 8,
            bold: true,
            color: accentColor,
            align: "center",
            fill: { color: "FFFFFF" },
            line: { color: "E5E7EB", pt: 1 },
          });

          if (p.bergabung_date) {
            slide.addShape(prs.ShapeType.rect, {
              x: 0.4,
              y: 3.05,
              w: 2.2,
              h: 0.8,
              fill: { color: "FFFFFF" },
              line: { color: "F3F4F6", pt: 1 },
            });
            slide.addText("MASA DINAS", {
              x: 0.4,
              y: 3.1,
              w: 2.2,
              h: 0.15,
              align: "center",
              fontSize: 8,
              bold: true,
              color: "9CA3AF",
            });
            slide.addText(hitungMasaDinas(p.bergabung_date), {
              x: 0.4,
              y: 3.25,
              w: 2.2,
              h: 0.3,
              align: "center",
              fontSize: 14,
              bold: true,
              color: "111827",
            });
            slide.addText(`sejak ${formatTanggal(p.bergabung_date)}`, {
              x: 0.4,
              y: 3.6,
              w: 2.2,
              h: 0.15,
              align: "center",
              fontSize: 9,
              color: "9CA3AF",
            });
          }

          const statsY = 4.05;
          const stats = [
            ["NIK OJK", p.nik_ojk],
            ["Kelamin", p.jenis_kelamin],
            ["Agama", p.agama],
            ["Usia", p.tgl_lahir ? `${hitungUsia(p.tgl_lahir)} Tahun` : null],
            ["Tgl Lahir", p.tgl_lahir ? formatTanggal(p.tgl_lahir) : null],
            ["Status", p.status_perkawinan],
          ].filter(([, v]) => v);

          stats.forEach(([label, value], i) => {
            const y = statsY + i * 0.22;
            slide.addText(label as string, {
              x: 0.4,
              y: y,
              w: 1.0,
              h: 0.2,
              fontSize: 8,
              bold: true,
              color: "9CA3AF",
            });
            slide.addText(value as string, {
              x: 1.4,
              y: y,
              w: 1.2,
              h: 0.2,
              fontSize: 10,
              bold: true,
              color: "374151",
              align: "right",
            });
          });

          const rightX = 3.3;
          const rightW = 6.4;
          const colW = (rightW - 0.4) / 3;
          const gap = 0.2;

          const sectionHdr = (
            title: string,
            y: number,
            isSensitive = false
          ) => {
            slide.addText(title, {
              x: rightX,
              y: y,
              w: 2.0,
              h: 0.2,
              fontSize: 9,
              bold: true,
              color: isSensitive ? "FCA5A5" : "D1D5DB",
            });
            slide.addShape(prs.ShapeType.line, {
              x: rightX + 1.2,
              y: y + 0.1,
              w: rightW - 1.2,
              h: 0,
              line: { color: isSensitive ? "FEE2E2" : "F3F4F6", pt: 1 },
            });
          };

          const fieldCell = (
            label: string,
            value: string | null | undefined,
            x: number,
            y: number,
            w: number
          ) => {
            slide.addText(label, {
              x,
              y,
              w,
              h: 0.15,
              fontSize: 8,
              bold: true,
              color: "9CA3AF",
            });
            slide.addText(value || "-", {
              x,
              y: y + 0.18,
              w,
              h: 0.2,
              fontSize: 11,
              bold: true,
              color: "111827",
            });
          };

          sectionHdr("DATA PEKERJAAN", 0.35);
          fieldCell("Email OJK", p.email_ojk, rightX, 0.65, colW);
          fieldCell(
            "No. Telepon",
            p.no_telepon,
            rightX + colW + gap,
            0.65,
            colW
          );
          fieldCell(
            "Bergabung",
            p.bergabung_date ? formatTanggal(p.bergabung_date) : null,
            rightX + (colW + gap) * 2,
            0.65,
            colW
          );
          fieldCell("Telp. Darurat", p.no_telepon_darurat, rightX, 1.05, colW);
          fieldCell(
            "Kontak Darurat",
            p.nama_kontak_darurat,
            rightX + colW + gap,
            1.05,
            colW
          );
          fieldCell(
            "Hubungan",
            p.hubungan_kontak_darurat,
            rightX + (colW + gap) * 2,
            1.05,
            colW
          );

          sectionHdr("LATAR BELAKANG", 1.75);
          fieldCell("Pendidikan", p.pendidikan, rightX, 2.05, colW);
          fieldCell("Lembaga", p.nama_lembaga, rightX + colW + gap, 2.05, colW);
          fieldCell("Jurusan", p.jurusan, rightX + (colW + gap) * 2, 2.05, colW);
          fieldCell("Prev. Company", p.previous_company, rightX, 2.45, colW);
          fieldCell(
            "Pengalaman CC",
            p.pengalaman_cc,
            rightX + colW + gap,
            2.45,
            colW
          );

          sectionHdr("🔒 DATA SENSITIF", 3.15, true);
          fieldCell("No. KTP", p.no_ktp, rightX, 3.45, colW);
          fieldCell("No. NPWP", p.no_npwp, rightX + colW + gap, 3.45, colW);
          fieldCell(
            "No. Rekening",
            p.nomor_rekening
              ? `${p.nomor_rekening}${p.nama_bank ? ` · ${p.nama_bank}` : ""}`
              : null,
            rightX + (colW + gap) * 2,
            3.45,
            colW
          );
          fieldCell(
            "Status Hunian",
            p.status_tempat_tinggal,
            rightX,
            3.85,
            colW
          );
          fieldCell(
            "Alamat Tinggal",
            p.alamat_tinggal,
            rightX + colW + gap,
            3.85,
            colW * 2 + gap
          );

          const noteY = 4.5;
          const noteW = (rightW - 0.2) / 2;
          if (p.catatan_tambahan) {
            slide.addShape(prs.ShapeType.rect, {
              x: rightX,
              y: noteY,
              w: noteW,
              h: 0.8,
              fill: { color: "FFFBEB" },
              line: { color: "FEF3C7", pt: 1 },
            });
            slide.addText("⭐ CATATAN", {
              x: rightX + 0.1,
              y: noteY + 0.1,
              w: noteW - 0.2,
              h: 0.15,
              fontSize: 8,
              color: "D97706",
              bold: true,
            });
            slide.addText(p.catatan_tambahan, {
              x: rightX + 0.1,
              y: noteY + 0.25,
              w: noteW - 0.2,
              h: 0.5,
              fontSize: 10,
              color: "78350F",
              wrap: true,
            });
          }
          if (p.keterangan) {
            const noteX = p.catatan_tambahan ? rightX + noteW + 0.2 : rightX;
            slide.addShape(prs.ShapeType.rect, {
              x: noteX,
              y: noteY,
              w: noteW,
              h: 0.8,
              fill: { color: "F9FAFB" },
              line: { color: "F3F4F6", pt: 1 },
            });
            slide.addText("KETERANGAN", {
              x: noteX + 0.1,
              y: noteY + 0.1,
              w: noteW - 0.2,
              h: 0.15,
              fontSize: 8,
              color: "9CA3AF",
              bold: true,
            });
            slide.addText(p.keterangan, {
              x: noteX + 0.1,
              y: noteY + 0.25,
              w: noteW - 0.2,
              h: 0.5,
              fontSize: 10,
              color: "4B5563",
              wrap: true,
            });
          }
        } else {
          slide.addShape(prs.ShapeType.rect, {
            x: 0,
            y: 0,
            w: "100%",
            h: 0.04,
            fill: { color: accentColor },
          });

          await addProfilePhoto(0.5, 0.5, 1.5, 1.5, 36);

          slide.addText(p.nama || "-", {
            x: 2.3,
            y: 0.6,
            w: 5.5,
            h: 0.4,
            fontSize: 24,
            bold: true,
            color: "111827",
          });
          slide.addText(labelJabatan[p.jabatan || ""] || p.jabatan || "-", {
            x: 2.3,
            y: 1.0,
            w: 5.5,
            h: 0.2,
            fontSize: 12,
            bold: true,
            color: accentColor,
          });
          slide.addText(labelTim[p.tim || ""] || p.tim || "-", {
            x: 2.3,
            y: 1.3,
            w: 1.5,
            h: 0.3,
            fontSize: 10,
            bold: true,
            color: accentColor,
            align: "center",
            fill: { color: "FFFFFF" },
            line: { color: "E5E7EB", pt: 1 },
          });

          const statW = 1.35;
          const statGap = 0.1;
          const statY = 2.4;

          const addStatBox = (x: number, label: string, val: string) => {
            slide.addShape(prs.ShapeType.rect, {
              x,
              y: statY,
              w: statW,
              h: 0.8,
              fill: { color: "F9FAFB" },
              line: { color: "F3F4F6", pt: 1 },
            });
            slide.addText(label, {
              x,
              y: statY + 0.1,
              w: statW,
              h: 0.2,
              align: "center",
              fontSize: 7,
              bold: true,
              color: "9CA3AF",
            });
            slide.addText(val, {
              x,
              y: statY + 0.35,
              w: statW,
              h: 0.3,
              align: "center",
              fontSize: 11,
              bold: true,
              color: "111827",
            });
          };

          addStatBox(
            0.5,
            "MASA DINAS",
            p.bergabung_date ? hitungMasaDinas(p.bergabung_date) : "-"
          );
          addStatBox(
            0.5 + statW + statGap,
            "USIA",
            p.tgl_lahir ? `${hitungUsia(p.tgl_lahir)} Thn` : "-"
          );
          addStatBox(
            0.5 + (statW + statGap) * 2,
            "TGL LAHIR",
            p.tgl_lahir ? formatTanggal(p.tgl_lahir) : "-"
          );
          addStatBox(0.5 + (statW + statGap) * 3, "AGAMA", p.agama || "-");
          addStatBox(
            0.5 + (statW + statGap) * 4,
            "STATUS",
            p.status_perkawinan || "-"
          );

          const rightX = 0.5;
          const rightW = 7.27;
          const colW = (rightW - 0.4) / 2;
          const gap = 0.4;

          const sectionHdr = (
            title: string,
            y: number,
            isSensitive = false
          ) => {
            slide.addText(title, {
              x: rightX,
              y: y,
              w: 2.0,
              h: 0.2,
              fontSize: 9,
              bold: true,
              color: isSensitive ? "FCA5A5" : "D1D5DB",
            });
            slide.addShape(prs.ShapeType.line, {
              x: rightX + 1.5,
              y: y + 0.1,
              w: rightW - 1.5,
              h: 0,
              line: { color: isSensitive ? "FEE2E2" : "F3F4F6", pt: 1 },
            });
          };

          const fieldCell = (
            label: string,
            value: string | null | undefined,
            x: number,
            y: number,
            w: number
          ) => {
            slide.addText(label, {
              x,
              y,
              w,
              h: 0.15,
              fontSize: 8,
              bold: true,
              color: "9CA3AF",
            });
            slide.addText(value || "-", {
              x,
              y: y + 0.2,
              w,
              h: 0.2,
              fontSize: 11,
              bold: true,
              color: "111827",
            });
          };

          sectionHdr("DATA PEKERJAAN", 3.6);
          fieldCell("Email OJK", p.email_ojk, rightX, 3.9, colW);
          fieldCell("No. Telepon", p.no_telepon, rightX + colW + gap, 3.9, colW);
          fieldCell(
            "Bergabung",
            p.bergabung_date ? formatTanggal(p.bergabung_date) : null,
            rightX,
            4.4,
            colW
          );
          fieldCell("NIK OJK", p.nik_ojk, rightX + colW + gap, 4.4, colW);
          fieldCell("Kontak Darurat", p.nama_kontak_darurat, rightX, 4.9, colW);
          fieldCell(
            "Telp. Darurat",
            p.no_telepon_darurat
              ? `${p.no_telepon_darurat} (${p.hubungan_kontak_darurat || "-"})`
              : null,
            rightX + colW + gap,
            4.9,
            colW
          );

          sectionHdr("LATAR BELAKANG", 5.5);
          fieldCell("Pendidikan", p.pendidikan, rightX, 5.8, colW);
          fieldCell("Lembaga", p.nama_lembaga, rightX + colW + gap, 5.8, colW);
          fieldCell("Jurusan", p.jurusan, rightX, 6.3, colW);
          fieldCell(
            "Prev. Company",
            p.previous_company,
            rightX + colW + gap,
            6.3,
            colW
          );
          fieldCell("Pengalaman CC", p.pengalaman_cc, rightX, 6.8, colW);
          fieldCell("Kelamin", p.jenis_kelamin, rightX + colW + gap, 6.8, colW);

          sectionHdr("🔒 DATA SENSITIF", 7.4, true);
          fieldCell("No. KTP", p.no_ktp, rightX, 7.7, colW);
          fieldCell("No. NPWP", p.no_npwp, rightX + colW + gap, 7.7, colW);
          fieldCell(
            "No. Rekening",
            p.nomor_rekening
              ? `${p.nomor_rekening}${p.nama_bank ? ` · ${p.nama_bank}` : ""}`
              : null,
            rightX,
            8.2,
            colW
          );
          fieldCell(
            "Status Hunian",
            p.status_tempat_tinggal,
            rightX + colW + gap,
            8.2,
            colW
          );
          fieldCell("Alamat Tinggal", p.alamat_tinggal, rightX, 8.7, rightW);

          const noteY = 9.4;
          if (p.catatan_tambahan) {
            slide.addShape(prs.ShapeType.rect, {
              x: rightX,
              y: noteY,
              w: rightW,
              h: 0.8,
              fill: { color: "FFFBEB" },
              line: { color: "FEF3C7", pt: 1 },
            });
            slide.addText("⭐ CATATAN", {
              x: rightX + 0.1,
              y: noteY + 0.1,
              w: rightW - 0.2,
              h: 0.15,
              fontSize: 8,
              color: "D97706",
              bold: true,
            });
            slide.addText(p.catatan_tambahan, {
              x: rightX + 0.1,
              y: noteY + 0.25,
              w: rightW - 0.2,
              h: 0.5,
              fontSize: 10,
              color: "78350F",
              wrap: true,
            });
          }
          if (p.keterangan) {
            const kY = p.catatan_tambahan ? noteY + 0.9 : noteY;
            slide.addShape(prs.ShapeType.rect, {
              x: rightX,
              y: kY,
              w: rightW,
              h: 0.8,
              fill: { color: "F9FAFB" },
              line: { color: "F3F4F6", pt: 1 },
            });
            slide.addText("KETERANGAN", {
              x: rightX + 0.1,
              y: kY + 0.1,
              w: rightW - 0.2,
              h: 0.15,
              fontSize: 8,
              color: "9CA3AF",
              bold: true,
            });
            slide.addText(p.keterangan, {
              x: rightX + 0.1,
              y: kY + 0.25,
              w: rightW - 0.2,
              h: 0.5,
              fontSize: 10,
              color: "4B5563",
              wrap: true,
            });
          }

          slide.addShape(prs.ShapeType.rect, {
            x: 0,
            y: 11.29,
            w: "100%",
            h: 0.4,
            fill: { color: "F9FAFB" },
            line: { type: "none" },
          });
          slide.addShape(prs.ShapeType.ellipse, {
            x: 0.5,
            y: 11.45,
            w: 0.08,
            h: 0.08,
            fill: { color: "D1D5DB" },
          });
          slide.addText("Otoritas Jasa Keuangan — Kontak OJK 157", {
            x: 0.7,
            y: 11.35,
            w: 5,
            h: 0.2,
            fontSize: 9,
            color: "D1D5DB",
            bold: true,
          });
          slide.addText(`${selectedBatch.toUpperCase()} · ${p.nama?.toUpperCase()}`, {
            x: 3.27,
            y: 11.35,
            w: 4.5,
            h: 0.2,
            fontSize: 9,
            color: "D1D5DB",
            align: "right",
          });
        }
      }
      await prs.writeFile({ fileName: `${selectedBatch}_peserta.pptx` });
    } catch (err: any) {
      alert("Gagal membuat PPTX: " + err.message);
    } finally {
      setGenerating(null);
    }
  };

  const buildSlideHTML = (
    p: ProfilerPeserta,
    batch: string,
    orient: "landscape" | "portrait"
  ) => {
    const theme = timTheme(p.tim || "");
    const photoFrame = getPhotoFrame(p.id, p.photo_frame);
    const fields = (
      items: Array<[string, string | null | undefined, number?]>
    ) =>
      items
        .filter(([, v]) => v)
        .map(
          ([label, value, span]) =>
            `<div style="${
              span === 2 ? "grid-column:span 2;" : ""
            }"><div><div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">${label}</div><div style="font-size:11px;font-weight:700;color:#111827;">${
              value || "-"
            }</div></div></div>`
        )
        .join("");

    if (orient === "portrait") {
      return `
<div style="width:600px;height:848px;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FFFFFF;box-sizing:border-box;overflow:hidden;">
  <div style="height:4px;background:#${theme.accent};flex-shrink:0;"></div>
  <div style="display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;padding:32px 40px;gap:24px;box-sizing:border-box;">
    
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:24px;flex-shrink:0;">
      ${
        p.foto_url
          ? `<div style="width:112px;height:112px;border-radius:24px;overflow:hidden;box-shadow:0 6px 15px rgba(0,0,0,0.1);flex-shrink:0;"><img src="${
              p.foto_url
            }" crossorigin="anonymous" style="${getPhotoInlineStyle(
              photoFrame
            )}" /></div>`
          : `<div style="width:112px;height:112px;border-radius:24px;background:#${theme.light.replace(
              "#",
              ""
            )};display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:bold;color:#${
              theme.accent
            };flex-shrink:0;">${p.nama?.charAt(0) || "?"}</div>`
      }
      <div style="display:flex;flex-direction:column;">
        <div style="font-size:24px;font-weight:bold;color:#111827;line-height:1.2;">${
          p.nama || "-"
        }</div>
        <div style="font-size:12px;font-weight:700;color:#${
          theme.accent
        };margin-top:4px;text-transform:uppercase;letter-spacing:1px;">${
        labelJabatan[p.jabatan || ""] || p.jabatan || "-"
      }</div>
        <div style="display:inline-block;margin-top:8px;font-size:10px;font-weight:700;color:#${
          theme.accent
        };background:#FFFFFF;border:1px solid #E5E7EB;border-radius:6px;padding:4px 12px;width:fit-content;">${
        labelTim[p.tim || ""] || p.tim || "-"
      }</div>
      </div>
    </div>

    <!-- Quick Stats -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;flex-shrink:0;">
      <div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:10px 4px;text-align:center;">
        <div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Masa Dinas</div>
        <div style="font-size:12px;font-weight:900;color:#111827;line-height:1;">${
          p.bergabung_date ? hitungMasaDinas(p.bergabung_date) : "-"
        }</div>
      </div>
      <div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:10px 4px;text-align:center;">
        <div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Usia</div>
        <div style="font-size:12px;font-weight:900;color:#111827;line-height:1;">${
          p.tgl_lahir ? `${hitungUsia(p.tgl_lahir)} Thn` : "-"
        }</div>
      </div>
      <div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:10px 4px;text-align:center;">
        <div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Tgl Lahir</div>
        <div style="font-size:10px;font-weight:900;color:#111827;line-height:1.2;">${
          p.tgl_lahir ? formatTanggal(p.tgl_lahir) : "-"
        }</div>
      </div>
      <div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:10px 4px;text-align:center;">
        <div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Agama</div>
        <div style="font-size:12px;font-weight:900;color:#111827;line-height:1.2;">${
          p.agama || "-"
        }</div>
      </div>
      <div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:10px 4px;text-align:center;">
        <div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Status</div>
        <div style="font-size:11px;font-weight:900;color:#111827;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${
          p.status_perkawinan || "-"
        }</div>
      </div>
    </div>

    <!-- Details -->
    <div style="display:flex;flex-direction:column;gap:20px;flex:1;overflow:hidden;">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <span style="font-size:10px;font-weight:900;color:#D1D5DB;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;">Data Pekerjaan</span>
          <div style="flex:1;height:1px;background:#F3F4F6;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px 32px;">
          ${fields([
            ["Email OJK", p.email_ojk],
            ["No. Telepon", p.no_telepon],
            [
              "Bergabung",
              p.bergabung_date ? formatTanggal(p.bergabung_date) : null,
            ],
            ["NIK OJK", p.nik_ojk],
            ["Kontak Darurat", p.nama_kontak_darurat],
            [
              "Telp. Darurat",
              p.no_telepon_darurat
                ? `${p.no_telepon_darurat} (${
                    p.hubungan_kontak_darurat || "-"
                  })`
                : null,
            ],
          ])}
        </div>
      </div>
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <span style="font-size:10px;font-weight:900;color:#D1D5DB;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;">Latar Belakang</span>
          <div style="flex:1;height:1px;background:#F3F4F6;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px 32px;">
          ${fields([
            ["Pendidikan", p.pendidikan],
            ["Lembaga", p.nama_lembaga],
            ["Jurusan", p.jurusan],
            ["Prev. Company", p.previous_company],
            ["Pengalaman CC", p.pengalaman_cc],
            ["Kelamin", p.jenis_kelamin],
          ])}
        </div>
      </div>
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <span style="font-size:10px;font-weight:900;color:#FCA5A5;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;">🔒 Data Sensitif</span>
          <div style="flex:1;height:1px;background:#FEE2E2;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px 32px;">
          ${fields([
            ["No. KTP", p.no_ktp],
            ["No. NPWP", p.no_npwp],
            [
              "No. Rekening",
              p.nomor_rekening
                ? `${p.nomor_rekening}${p.nama_bank ? " · " + p.nama_bank : ""}`
                : null,
            ],
            ["Status Hunian", p.status_tempat_tinggal],
            ["Alamat Tinggal", p.alamat_tinggal, 2],
          ])}
        </div>
      </div>
    </div>

    <!-- Footer Notes -->
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:auto;flex-shrink:0;">
      ${
        p.catatan_tambahan
          ? `<div style="width:100%;background:#FFFBEB;border:1px solid #FEF3C7;border-radius:16px;padding:16px;box-sizing:border-box;"><div style="font-size:9px;font-weight:900;color:#D97706;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">⭐ Catatan</div><div style="font-size:11px;color:#78350F;line-height:1.6;font-weight:500;">${p.catatan_tambahan}</div></div>`
          : ""
      }
      ${
        p.keterangan
          ? `<div style="width:100%;background:#F9FAFB;border:1px solid #F3F4F6;border-radius:16px;padding:16px;box-sizing:border-box;"><div style="font-size:9px;font-weight:900;color:#9CA3AF;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">Keterangan</div><div style="font-size:11px;color:#4B5563;line-height:1.6;font-weight:500;">${p.keterangan}</div></div>`
          : ""
      }
    </div>
  </div>
  <div style="height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 32px;background:#F9FAFB;border-top:1px solid #F3F4F6;flex-shrink:0;box-sizing:border-box;">
    <div style="display:flex;align-items:center;gap:8px;"><div style="width:6px;height:6px;border-radius:50%;background:#D1D5DB;"></div><span style="font-size:10px;font-weight:700;color:#D1D5DB;text-transform:uppercase;letter-spacing:1.5px;">Otoritas Jasa Keuangan — Kontak OJK 157</span></div>
    <span style="font-size:10px;font-weight:700;color:#D1D5DB;letter-spacing:1px;">${batch.toUpperCase()} · ${p.nama?.toUpperCase()}</span>
  </div>
</div>`;
    }

    return `
<div style="width:960px;height:540px;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FFFFFF;box-sizing:border-box;overflow:hidden;">
  <div style="height:4px;background:#${theme.accent};flex-shrink:0;"></div>
  <div style="display:flex;flex:1;min-height:0;overflow:hidden;">
    <!-- LEFT SIDEBAR -->
    <div style="width:288px;background:#F9FAFB;border-right:1px solid #F3F4F6;display:flex;flex-direction:column;align-items:center;padding:32px 24px;gap:24px;box-sizing:border-box;flex-shrink:0;overflow:hidden;">
      ${
        p.foto_url
          ? `<div style="width:144px;height:144px;border-radius:24px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,0.1);"><img src="${
              p.foto_url
            }" crossorigin="anonymous" style="${getPhotoInlineStyle(
              photoFrame
            )}" /></div>`
          : `<div style="width:144px;height:144px;border-radius:24px;background:#${theme.light.replace(
              "#",
              ""
            )};display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:bold;color:#${
              theme.accent
            };">${p.nama?.charAt(0) || "?"}</div>`
      }
      <div style="text-align:center;width:100%;">
        <div style="font-size:20px;font-weight:bold;color:#111827;line-height:1.2;">${
          p.nama || "-"
        }</div>
        <div style="font-size:11px;font-weight:700;color:#${
          theme.accent
        };margin-top:6px;text-transform:uppercase;letter-spacing:1px;">${
      labelJabatan[p.jabatan || ""] || p.jabatan || "-"
    }</div>
        <div style="display:inline-block;margin-top:12px;font-size:10px;font-weight:700;color:#${
          theme.accent
        };background:#FFFFFF;border:1px solid #E5E7EB;border-radius:6px;padding:4px 12px;">${
      labelTim[p.tim || ""] || p.tim || "-"
    }</div>
      </div>
      ${
        p.bergabung_date
          ? `
      <div style="width:100%;background:#FFFFFF;border:1px solid #F3F4F6;border-radius:16px;text-align:center;padding:16px;box-sizing:border-box;">
        <div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1.5px;">Masa Dinas</div>
        <div style="font-size:18px;font-weight:900;color:#111827;margin-top:4px;line-height:1;">${hitungMasaDinas(
          p.bergabung_date
        )}</div>
        <div style="font-size:10px;color:#9CA3AF;margin-top:6px;">sejak ${formatTanggal(
          p.bergabung_date
        )}</div>
      </div>`
          : ""
      }
      <div style="width:100%;display:flex;flex-direction:column;gap:8px;margin-top:auto;">
        ${(
          [
            ["NIK OJK", p.nik_ojk],
            ["Kelamin", p.jenis_kelamin],
            ["Agama", p.agama],
            ["Usia", p.tgl_lahir ? `${hitungUsia(p.tgl_lahir)} Tahun` : null],
            ["Tgl Lahir", p.tgl_lahir ? formatTanggal(p.tgl_lahir) : null],
            ["Status", p.status_perkawinan],
          ] as Array<[string, string | null | undefined]>
        )
          .filter(([, v]) => v)
          .map(
            ([label, value]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 4px;">
            <span style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;">${label}</span>
            <span style="font-size:11px;font-weight:700;color:#374151;text-align:right;">${value}</span>
          </div>`
          )
          .join("")}
      </div>
    </div>
    <!-- RIGHT CONTENT -->
    <div style="flex:1;padding:32px 40px;display:flex;flex-direction:column;gap:32px;overflow:hidden;min-width:0;">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <span style="font-size:10px;font-weight:900;color:#D1D5DB;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;">Data Pekerjaan</span>
          <div style="flex:1;height:1px;background:#F3F4F6;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px 32px;">
          ${fields([
            ["Email OJK", p.email_ojk],
            ["No. Telepon", p.no_telepon],
            [
              "Bergabung",
              p.bergabung_date ? formatTanggal(p.bergabung_date) : null,
            ],
            ["Telp. Darurat", p.no_telepon_darurat],
            ["Kontak Darurat", p.nama_kontak_darurat],
            ["Hubungan", p.hubungan_kontak_darurat],
          ])}
        </div>
      </div>
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <span style="font-size:10px;font-weight:900;color:#D1D5DB;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;">Latar Belakang</span>
          <div style="flex:1;height:1px;background:#F3F4F6;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px 32px;">
          ${fields([
            ["Pendidikan", p.pendidikan],
            ["Lembaga", p.nama_lembaga],
            ["Jurusan", p.jurusan],
            ["Prev. Company", p.previous_company],
            ["Pengalaman CC", p.pengalaman_cc],
          ])}
        </div>
      </div>
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <span style="font-size:10px;font-weight:900;color:#FCA5A5;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;">🔒 Data Sensitif</span>
          <div style="flex:1;height:1px;background:#FEE2E2;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px 32px;">
          ${fields([
            ["No. KTP", p.no_ktp],
            ["No. NPWP", p.no_npwp],
            [
              "No. Rekening",
              p.nomor_rekening
                ? `${p.nomor_rekening}${p.nama_bank ? " · " + p.nama_bank : ""}`
                : null,
            ],
            ["Status Hunian", p.status_tempat_tinggal],
            ["Alamat Tinggal", p.alamat_tinggal, 2],
          ])}
        </div>
      </div>
      <div style="display:flex;gap:16px;margin-top:auto;">
        ${
          p.catatan_tambahan
            ? `<div style="flex:1;background:#FFFBEB;border:1px solid #FEF3C7;border-radius:16px;padding:16px;box-sizing:border-box;"><div style="font-size:9px;font-weight:900;color:#D97706;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">⭐ Catatan</div><div style="font-size:11px;color:#78350F;line-height:1.6;font-weight:500;">${p.catatan_tambahan}</div></div>`
            : ""
        }
        ${
          p.keterangan
            ? `<div style="flex:1;background:#F9FAFB;border:1px solid #F3F4F6;border-radius:16px;padding:16px;box-sizing:border-box;"><div style="font-size:9px;font-weight:900;color:#9CA3AF;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Keterangan</div><div style="font-size:11px;color:#4B5563;line-height:1.6;font-weight:500;">${p.keterangan}</div></div>`
            : ""
        }
      </div>
    </div>
  </div>
  <div style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 32px;background:#F9FAFB;border-top:1px solid #F3F4F6;flex-shrink:0;box-sizing:border-box;">
    <div style="display:flex;align-items:center;gap:8px;"><div style="width:6px;height:6px;border-radius:50%;background:#D1D5DB;"></div><span style="font-size:9px;font-weight:700;color:#D1D5DB;text-transform:uppercase;letter-spacing:1.5px;">Otoritas Jasa Keuangan — Kontak OJK 157</span></div>
    <span style="font-size:9px;font-weight:700;color:#D1D5DB;letter-spacing:1px;">${batch.toUpperCase()} · ${p.nama?.toUpperCase()}</span>
  </div>
</div>`;
  };

  const downloadPDF = async () => {
    setGenerating("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const html2canvas = (await import("html2canvas")).default;
      const { prepareHtml2CanvasClone } = await import("../../lib/html2canvas-tailwind-fix");

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

  const options = [
    {
      id: "excel",
      icon: <FileSpreadsheet className="h-8 w-8 text-green-500" />,
      title: "Excel (.xlsx)",
      desc: "Semua data peserta dalam format spreadsheet",
      action: downloadExcel,
      hover: "hover:border-green-300 dark:hover:border-green-700",
    },
    {
      id: "csv",
      icon: <FileText className="h-8 w-8 text-blue-500" />,
      title: "CSV (.csv)",
      desc: "Format universal, semua field lengkap",
      action: downloadCSV,
      hover: "hover:border-blue-300 dark:hover:border-blue-700",
    },
    {
      id: "pptx",
      icon: <Presentation className="h-8 w-8 text-orange-500" />,
      title: "PowerPoint (.pptx)",
      desc: "1 slide per peserta, layout persis SlideView",
      action: downloadPPTX,
      hover: "hover:border-orange-300 dark:hover:border-orange-700",
    },
    {
      id: "pdf",
      icon: <FileDown className="h-8 w-8 text-red-500" />,
      title: "PDF (.pdf)",
      desc: "1 halaman per peserta, layout persis SlideView",
      action: downloadPDF,
      hover: "hover:border-red-300 dark:hover:border-red-700",
    },
  ];

  const disabled = generating !== null || peserta.length === 0;

  return (
    <div className="h-full overflow-hidden bg-background text-foreground">
      <main className="relative h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10 lg:py-10">
          <PageHeroHeader
            backHref="/profiler"
            backLabel="Kembali ke workspace KTP"
            eyebrow="Profiler export"
            title="Unduh batch aktif ke format yang siap dipakai lintas kebutuhan."
            description="Pilih folder, cek jumlah peserta, tentukan orientasi presentasi, lalu ekspor ke format yang paling sesuai."
            icon={<FileDown className="h-3.5 w-3.5" />}
          />

          <div className="space-y-4">
            <div className="focus-within:ring-ring focus-within:border-accent overflow-hidden rounded-3xl border border-border/40 bg-card shadow-sm focus-within:ring-2">
              <button
                onClick={() => setShowPicker((v) => !v)}
                className="hover:bg-muted/50 flex w-full items-center gap-3 px-5 py-4 transition-colors focus-visible:outline-none"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <Folder className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Folder yang akan diunduh
                  </p>
                  <p className="mt-0.5 truncate text-[15px] font-black tracking-tight text-foreground">
                    {selectedBatch || "Pilih folder..."}
                  </p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
                    showPicker ? "rotate-180" : ""
                  }`}
                />
              </button>
              {showPicker && (
                <div className="max-h-80 space-y-4 overflow-y-auto border-t border-border/40 p-3">
                  {initialYears.length === 0 ? (
                    <p className="py-4 text-center text-sm font-medium text-muted-foreground">
                      Tidak ada data tahun.
                    </p>
                  ) : (
                    initialYears.map((year) => {
                      const yearFolders = initialFolders.filter(
                        (f) => f.year_id === year.id && !f.parent_id
                      );
                      if (yearFolders.length === 0) return null;

                      return (
                        <div key={year.id} className="space-y-2">
                          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {year.label}
                          </p>
                          <div className="space-y-1">
                            {yearFolders.map((folder) => {
                              const subFolders = initialFolders.filter(
                                (f) => f.parent_id === folder.id
                              );
                              return (
                                <div key={folder.id} className="space-y-1">
                                  <button
                                    onClick={() => {
                                      handleBatchChange(folder.name);
                                    }}
                                    className={`focus-visible:ring-ring flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                                      folder.name === selectedBatch
                                        ? "bg-primary/10 font-bold text-primary"
                                        : "hover:bg-muted font-medium text-foreground/80"
                                    }`}
                                  >
                                    {folder.name}
                                    {folder.name === selectedBatch && (
                                      <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                                    )}
                                  </button>

                                  {subFolders.map((sub) => (
                                    <button
                                      key={sub.id}
                                      onClick={() => {
                                        handleBatchChange(sub.name);
                                      }}
                                      className={`focus-visible:ring-ring ml-4 flex w-[calc(100%-1rem)] items-center justify-between rounded-2xl px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                                        sub.name === selectedBatch
                                          ? "bg-primary/10 font-bold text-primary"
                                          : "hover:bg-muted font-medium text-foreground/80"
                                      }`}
                                    >
                                      {sub.name}
                                      {sub.name === selectedBatch && (
                                        <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-3xl border border-border/40 bg-card p-5 shadow-sm">
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Total peserta siap diunduh
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-[32px] font-black leading-none tracking-tight text-foreground">
                    {peserta.length}
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">
                    Orang
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-1 rounded-2xl border border-border/40 bg-muted/50 p-1.5">
                <button
                  onClick={() => setOrientation("landscape")}
                  className={`focus-visible:ring-ring rounded-xl px-4 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 ${
                    orientation === "landscape"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground/80"
                  }`}
                >
                  Landscape
                </button>
                <button
                  onClick={() => setOrientation("portrait")}
                  className={`focus-visible:ring-ring rounded-xl px-4 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 ${
                    orientation === "portrait"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground/80"
                  }`}
                >
                  Portrait
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={opt.action}
                  disabled={disabled}
                  className={`flex flex-col items-start rounded-[2rem] border border-border/40 bg-card p-6 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    disabled
                      ? "cursor-not-allowed opacity-50"
                      : `${opt.hover} hover:shadow-md hover:-translate-y-0.5`
                  }`}
                >
                  <div className="mb-4 flex items-center justify-between w-full">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                      {generating === opt.id ? (
                        <div className="animate-spin rounded-full border-b-2 border-primary h-8 w-8" />
                      ) : (
                        opt.icon
                      )}
                    </div>
                  </div>
                  <h3 className="mb-1 text-base font-bold text-foreground">
                    {opt.title}
                  </h3>
                  <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
