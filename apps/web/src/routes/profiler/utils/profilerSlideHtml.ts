import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { getPhotoFrame, getPhotoInlineStyle } from "../../../lib/photo-frame";
import { formatTanggal, hitungMasaDinas, hitungUsia, labelTim, timTheme } from "./profilerFormatters";

const escapeHtml = (value: string | number | null | undefined): string =>
  String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char] ?? char;
  });

export const buildSlideHTML = (
  p: ProfilerPeserta,
  batch: string,
  orient: "landscape" | "portrait"
) => {
  const theme = timTheme(p.tim || "");
  const photoFrame = getPhotoFrame(p.id, p.photo_frame);
  const photoSrc = p.foto_url ? escapeHtml(p.foto_url) : "";
  const displayName = escapeHtml(p.nama || "-");
  const displayInitial = escapeHtml(p.nama?.charAt(0) || "?");
  const displayJabatan = escapeHtml(
    labelJabatan[p.jabatan || ""] || p.jabatan || "-"
  );
  const displayTim = escapeHtml(labelTim[p.tim || ""] || p.tim || "-");
  const footerBatch = escapeHtml(batch.toUpperCase());
  const footerName = escapeHtml(p.nama?.toUpperCase() || "-");
  const fields = (
    items: Array<[string, string | null | undefined, number?]>
  ) =>
    items
      .filter(([, v]) => v)
      .map(
        ([label, value, span]) =>
          `<div style="${
            span === 2 ? "grid-column:span 2;" : ""
          }"><div><div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">${escapeHtml(label)}</div><div style="font-size:11px;font-weight:700;color:#111827;">${
            escapeHtml(value || "-")
          }</div></div></div>`
      )
      .join("");

  if (orient === "portrait") {
    return `
<div style="width:600px;height:848px;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FFFFFF;box-sizing:border-box;overflow:hidden;">
  <div style="height:4px;background:#${theme.accentRaw};flex-shrink:0;"></div>
  <div style="display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;padding:32px 40px;gap:24px;box-sizing:border-box;">
    
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:24px;flex-shrink:0;">
      ${
        p.foto_url
          ? `<div style="width:112px;height:112px;border-radius:24px;overflow:hidden;box-shadow:0 6px 15px rgba(0,0,0,0.1);flex-shrink:0;"><img src="${
              photoSrc
            }" crossorigin="anonymous" style="${getPhotoInlineStyle(
              photoFrame
            )}" /></div>`
          : `<div style="width:112px;height:112px;border-radius:24px;background:#${theme.light.replace(
              "#",
              ""
            )};display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:bold;color:#${
              theme.accentRaw
            };flex-shrink:0;">${displayInitial}</div>`
      }
      <div style="display:flex;flex-direction:column;">
        <div style="font-size:24px;font-weight:bold;color:#111827;line-height:1.2;">${
          displayName
        }</div>
        <div style="font-size:12px;font-weight:700;color:#${
          theme.accentRaw
        };margin-top:4px;text-transform:uppercase;letter-spacing:1px;">${
        displayJabatan
      }</div>
        <div style="display:inline-block;margin-top:8px;font-size:10px;font-weight:700;color:#${
          theme.accentRaw
        };background:#FFFFFF;border:1px solid #E5E7EB;border-radius:6px;padding:4px 12px;width:fit-content;">${
        displayTim
      }</div>
      </div>
    </div>

    <!-- Quick Stats -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;flex-shrink:0;">
      <div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:10px 4px;text-align:center;">
        <div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Masa Dinas</div>
        <div style="font-size:12px;font-weight:900;color:#111827;line-height:1;">${
          escapeHtml(p.bergabung_date ? hitungMasaDinas(p.bergabung_date) : "-")
        }</div>
      </div>
      <div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:10px 4px;text-align:center;">
        <div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Usia</div>
        <div style="font-size:12px;font-weight:900;color:#111827;line-height:1;">${
          escapeHtml(p.tgl_lahir ? `${hitungUsia(p.tgl_lahir)} Thn` : "-")
        }</div>
      </div>
      <div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:10px 4px;text-align:center;">
        <div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Tgl Lahir</div>
        <div style="font-size:10px;font-weight:900;color:#111827;line-height:1.2;">${
          escapeHtml(p.tgl_lahir ? formatTanggal(p.tgl_lahir) : "-")
        }</div>
      </div>
      <div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:10px 4px;text-align:center;">
        <div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Agama</div>
        <div style="font-size:12px;font-weight:900;color:#111827;line-height:1.2;">${
          escapeHtml(p.agama || "-")
        }</div>
      </div>
      <div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:12px;padding:10px 4px;text-align:center;">
        <div style="font-size:8px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Status</div>
        <div style="font-size:11px;font-weight:900;color:#111827;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${
          escapeHtml(p.status_perkawinan || "-")
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
          ? `<div style="width:100%;background:#FFFBEB;border:1px solid #FEF3C7;border-radius:16px;padding:16px;box-sizing:border-box;"><div style="font-size:9px;font-weight:900;color:#D97706;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">⭐ Catatan</div><div style="font-size:11px;color:#78350F;line-height:1.6;font-weight:500;">${escapeHtml(p.catatan_tambahan)}</div></div>`
          : ""
      }
      ${
        p.keterangan
          ? `<div style="width:100%;background:#F9FAFB;border:1px solid #F3F4F6;border-radius:16px;padding:16px;box-sizing:border-box;"><div style="font-size:9px;font-weight:900;color:#9CA3AF;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;">Keterangan</div><div style="font-size:11px;color:#4B5563;line-height:1.6;font-weight:500;">${escapeHtml(p.keterangan)}</div></div>`
          : ""
      }
    </div>
  </div>
  <div style="height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 32px;background:#F9FAFB;border-top:1px solid #F3F4F6;flex-shrink:0;box-sizing:border-box;">
    <div style="display:flex;align-items:center;gap:8px;"><div style="width:6px;height:6px;border-radius:50%;background:#D1D5DB;"></div><span style="font-size:10px;font-weight:700;color:#D1D5DB;text-transform:uppercase;letter-spacing:1.5px;">Otoritas Jasa Keuangan — Kontak OJK 157</span></div>
    <span style="font-size:10px;font-weight:700;color:#D1D5DB;letter-spacing:1px;">${footerBatch} · ${footerName}</span>
  </div>
</div>`;
  }

  return `
<div style="width:960px;height:540px;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FFFFFF;box-sizing:border-box;overflow:hidden;">
  <div style="height:4px;background:#${theme.accentRaw};flex-shrink:0;"></div>
  <div style="display:flex;flex:1;min-height:0;overflow:hidden;">
    <!-- LEFT SIDEBAR -->
    <div style="width:288px;background:#F9FAFB;border-right:1px solid #F3F4F6;display:flex;flex-direction:column;align-items:center;padding:32px 24px;gap:24px;box-sizing:border-box;flex-shrink:0;overflow:hidden;">
      ${
        p.foto_url
          ? `<div style="width:144px;height:144px;border-radius:24px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,0.1);"><img src="${
              photoSrc
            }" crossorigin="anonymous" style="${getPhotoInlineStyle(
              photoFrame
            )}" /></div>`
          : `<div style="width:144px;height:144px;border-radius:24px;background:#${theme.light.replace(
              "#",
              ""
            )};display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:bold;color:#${
              theme.accentRaw
            };">${displayInitial}</div>`
      }
      <div style="text-align:center;width:100%;">
        <div style="font-size:20px;font-weight:bold;color:#111827;line-height:1.2;">${
          displayName
        }</div>
        <div style="font-size:11px;font-weight:700;color:#${
          theme.accentRaw
        };margin-top:6px;text-transform:uppercase;letter-spacing:1px;">${
      displayJabatan
    }</div>
        <div style="display:inline-block;margin-top:12px;font-size:10px;font-weight:700;color:#${
          theme.accentRaw
        };background:#FFFFFF;border:1px solid #E5E7EB;border-radius:6px;padding:4px 12px;">${
      displayTim
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
            <span style="font-size:11px;font-weight:700;color:#374151;text-align:right;">${escapeHtml(value)}</span>
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
            ? `<div style="flex:1;background:#FFFBEB;border:1px solid #FEF3C7;border-radius:16px;padding:16px;box-sizing:border-box;"><div style="font-size:9px;font-weight:900;color:#D97706;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">⭐ Catatan</div><div style="font-size:11px;color:#78350F;line-height:1.6;font-weight:500;">${escapeHtml(p.catatan_tambahan)}</div></div>`
            : ""
        }
        ${
          p.keterangan
            ? `<div style="flex:1;background:#F9FAFB;border:1px solid #F3F4F6;border-radius:16px;padding:16px;box-sizing:border-box;"><div style="font-size:9px;font-weight:900;color:#9CA3AF;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Keterangan</div><div style="font-size:11px;color:#4B5563;line-height:1.6;font-weight:500;">${escapeHtml(p.keterangan)}</div></div>`
            : ""
        }
      </div>
    </div>
  </div>
  <div style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 32px;background:#F9FAFB;border-top:1px solid #F3F4F6;flex-shrink:0;box-sizing:border-box;">
    <div style="display:flex;align-items:center;gap:8px;"><div style="width:6px;height:6px;border-radius:50%;background:#D1D5DB;"></div><span style="font-size:9px;font-weight:700;color:#D1D5DB;text-transform:uppercase;letter-spacing:1.5px;">Otoritas Jasa Keuangan — Kontak OJK 157</span></div>
    <span style="font-size:9px;font-weight:700;color:#D1D5DB;letter-spacing:1px;">${footerBatch} · ${footerName}</span>
  </div>
</div>`;
};
