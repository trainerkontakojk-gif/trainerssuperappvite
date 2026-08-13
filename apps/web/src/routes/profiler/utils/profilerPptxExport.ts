import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { getPhotoFrame } from "../../../lib/photo-frame";
import { buildFramedPhotoData } from "./profilerExportUtils";
import { sanitizeProfilerPptxImageData } from "./profilerPptxImageBoundary";
import { formatTanggal, hitungMasaDinas, hitungUsia, labelTim, timTheme } from "./profilerFormatters";

export const downloadPPTX = async (
  peserta: ProfilerPeserta[],
  selectedBatch: string,
  orientation: "landscape" | "portrait",
  setGenerating: (val: string | null) => void
) => {
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
      const accentColor = theme.accentRaw;
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
          const framedData = sanitizeProfilerPptxImageData(
            await buildFramedPhotoData(p.foto_url, frame),
          );
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
              throw new Error("Unsupported or unreadable profile image.");
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
