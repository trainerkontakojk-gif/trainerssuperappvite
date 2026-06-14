import React from "react";
import type { ProfilerPeserta } from "@trainers/types";
import { labelJabatan } from "@trainers/types";
import { getPhotoFrame, getPhotoImageStyle } from "../../../../lib/photo-frame";
import {
  timTheme,
  hitungMasaDinas,
  hitungUsia,
  formatTanggal,
} from "../../utils/profilerFormatters";

type SlideMode = "original" | "portraitA4";

const Cell = ({
  label,
  value,
  icon: Icon,
  multiline = false,
}: {
  label: string;
  value?: string | null;
  icon?: any;
  multiline?: boolean;
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-1.5">
      {Icon && <Icon className="h-3 w-3 text-fg3" />}
      <span className="text-[9px] font-semibold uppercase leading-none tracking-widest text-fg3">
        {label}
      </span>
    </div>
    <span
      className={`text-xs font-semibold leading-tight text-fg ${
        multiline ? "break-words whitespace-normal" : "truncate"
      }`}
    >
      {value || "-"}
    </span>
  </div>
);

interface ParticipantSlideProps {
  participant: ProfilerPeserta;
  slideMode: SlideMode;
}

export const ParticipantSlide: React.FC<ParticipantSlideProps> = ({
  participant,
  slideMode,
}) => {
  const p = participant;
  const theme = timTheme(p.tim || "");

  const renderPolishedContent = (p: ProfilerPeserta) => {
    return (
      <div className="relative flex flex-1 flex-col overflow-hidden bg-background">
        <div className="relative z-10 box-border flex flex-1 flex-col gap-5 overflow-y-auto p-7">
          <section className="bg-surface border border-border rounded-xl p-5">
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[132px_1fr]">
              {p.foto_url ? (
                <div className="relative h-32 w-32 overflow-hidden rounded-xl border border-border">
                  <img
                    src={p.foto_url}
                    alt={p.nama || ""}
                    className="h-full w-full object-cover"
                    style={getPhotoImageStyle(
                      getPhotoFrame(p.id, p.photo_frame)
                    )}
                    crossOrigin="anonymous"
                  />
                </div>
              ) : (
                <div
                  className="flex h-32 w-32 items-center justify-center rounded-xl text-5xl font-semibold bg-surface border border-border"
                  style={{
                    color: "var(--fg2)",
                  }}
                >
                  {p.nama?.charAt(0)}
                </div>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-fg3">
                  Portrait A4
                </p>
                <h3 className="text-fg mt-2 text-2xl font-bold leading-tight tracking-tight">
                  {p.nama}
                </h3>
                <p className="text-fg2 mt-2 text-[11px] font-medium uppercase tracking-[0.2em]">
                  {labelJabatan[p.jabatan || ""] || p.jabatan} · {theme.label}
                </p>
                <div className="text-fg2 mt-3 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-[0.15em]">
                  <span className="border-border bg-surface rounded-lg border px-2.5 py-1">
                    Masa dinas:{" "}
                    {p.bergabung_date
                      ? hitungMasaDinas(p.bergabung_date)
                      : "-"}
                  </span>
                  <span className="border-border bg-surface rounded-lg border px-2.5 py-1">
                    Usia: {p.tgl_lahir ? `${hitungUsia(p.tgl_lahir)} tahun` : "-"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-surface border border-border rounded-xl p-5">
            <p className="text-fg font-semibold text-[10px] uppercase tracking-[0.24em] mb-4">
              Identitas dan Kontak
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Cell label="Email OJK" value={p.email_ojk} />
              <Cell label="No. Telepon" value={p.no_telepon} />
              <Cell
                label="Tanggal Bergabung"
                value={p.bergabung_date ? formatTanggal(p.bergabung_date) : null}
              />
              <Cell label="NIK OJK" value={p.nik_ojk} />
              <Cell label="Kontak Darurat" value={p.no_telepon_darurat} />
              <Cell
                label="Hubungan Darurat"
                value={p.hubungan_kontak_darurat}
              />
            </div>
          </section>

          <section className="bg-surface border border-border rounded-xl p-5">
            <p className="text-fg text-[10px] font-semibold uppercase tracking-[0.24em] mb-4">
              Data Pribadi dan Latar Belakang
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Cell label="Jenis Kelamin" value={p.jenis_kelamin} />
              <Cell label="Status Perkawinan" value={p.status_perkawinan} />
              <Cell label="Agama" value={p.agama} />
              <Cell
                label="Tanggal Lahir"
                value={p.tgl_lahir ? formatTanggal(p.tgl_lahir) : null}
              />
              <Cell label="Pendidikan" value={p.pendidikan} />
              <Cell label="Lembaga" value={p.nama_lembaga} />
              <Cell label="Jurusan" value={p.jurusan} />
              <Cell label="Previous Company" value={p.previous_company} />
              <Cell label="Pengalaman CC" value={p.pengalaman_cc} />
              <Cell label="Status Hunian" value={p.status_tempat_tinggal} />
            </div>
          </section>

          <section className="bg-surface border border-border rounded-xl p-5">
            <p className="text-fg text-[10px] font-semibold uppercase tracking-[0.24em] mb-4">
              Data Sensitif
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Cell label="No. KTP" value={p.no_ktp} />
              <Cell label="No. NPWP" value={p.no_npwp} />
              <Cell
                label="No. Rekening"
                value={
                  p.nomor_rekening
                    ? `${p.nomor_rekening}${
                        p.nama_bank ? ` · ${p.nama_bank}` : ""
                      }`
                    : null
                }
              />
              <Cell
                label="Alamat Tinggal"
                value={p.alamat_tinggal}
                multiline={true}
              />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 pb-1 sm:grid-cols-2">
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-fg2">
                Catatan Tambahan
              </p>
              <p className="text-fg2 mt-2 text-sm leading-6">
                {p.catatan_tambahan || "Tidak ada catatan tambahan."}
              </p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-fg2 text-[10px] font-semibold uppercase tracking-[0.24em]">
                Keterangan Internal
              </p>
              <p className="text-fg2 mt-2 text-sm leading-6">
                {p.keterangan || "Tidak ada keterangan internal."}
              </p>
            </div>
          </section>
        </div>
      </div>
    );
  };

  if (slideMode === "original") {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
        {/* LEFT SIDEBAR 30% */}
        <div className="bg-surface border-border flex w-[30%] shrink-0 flex-col items-center gap-6 overflow-y-auto border-r box-border px-6 pb-12 pt-8">
          {p.foto_url ? (
            <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-xl border border-border">
              <img
                src={p.foto_url}
                alt={p.nama || ""}
                className="h-full w-full object-cover"
                style={getPhotoImageStyle(getPhotoFrame(p.id, p.photo_frame))}
                crossOrigin="anonymous"
              />
            </div>
          ) : (
            <div
              className="flex h-32 w-32 shrink-0 items-center justify-center rounded-xl text-4xl font-semibold bg-surface border border-border"
              style={{
                color: "var(--fg2)",
              }}
            >
              {p.nama?.charAt(0)}
            </div>
          )}

          <div className="w-full shrink-0 text-center">
            <h2 className="text-fg truncate text-xl font-bold leading-tight tracking-tight">
              {p.nama}
            </h2>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-fg2">
              {labelJabatan[p.jabatan || ""] || p.jabatan}
            </p>
            <div className="bg-surface border-border mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-1 font-semibold text-[9px] text-fg2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg2" />
              {theme.label}
            </div>
          </div>

          <div className="bg-surface border-border w-full shrink-0 rounded-xl border p-4 text-center">
            <p className="text-fg3 mb-1 text-[9px] font-semibold uppercase tracking-[0.15em]">
              Masa Dinas
            </p>
            <p className="text-fg text-lg font-bold leading-none tracking-tight">
              {p.bergabung_date ? hitungMasaDinas(p.bergabung_date) : "-"}
            </p>
            <p className="text-fg3 mt-1.5 text-[9px] font-medium tracking-tight">
              {p.bergabung_date ? `Sejak ${formatTanggal(p.bergabung_date)}` : "-"}
            </p>
          </div>

          <div className="mt-auto flex w-full shrink-0 flex-col gap-2">
            {(
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
              .map(([label, value]) => (
                <div
                  key={label as string}
                  className="flex items-center justify-between gap-2 px-1"
                >
                  <span className="text-fg3 shrink-0 text-[9px] font-semibold uppercase tracking-widest">
                    {label}
                  </span>
                  <span className="text-fg truncate text-right text-[10px] font-medium tracking-tight">
                    {value as string}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* RIGHT CONTENT 70% */}
        <div className="box-border flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-10 pb-12 pt-8">
          <div className="flex shrink-0 flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-fg2 text-[10px] font-semibold uppercase tracking-[0.2em]">
                Data Pekerjaan
              </span>
              <div className="bg-border/60 h-px flex-1" />
            </div>
            <div className="grid grid-cols-3 gap-x-8 gap-y-4">
              <Cell label="Email OJK" value={p.email_ojk} />
              <Cell label="No. Telepon" value={p.no_telepon} />
              <Cell
                label="Bergabung"
                value={p.bergabung_date ? formatTanggal(p.bergabung_date) : null}
              />
              <Cell label="Telepon Darurat" value={p.no_telepon_darurat} />
              <Cell
                label="Nama Kontak Darurat"
                value={p.nama_kontak_darurat}
              />
              <Cell label="Hubungan" value={p.hubungan_kontak_darurat} />
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-fg2 text-[10px] font-semibold uppercase tracking-[0.2em]">
                Latar Belakang
              </span>
              <div className="bg-border/60 h-px flex-1" />
            </div>
            <div className="grid grid-cols-3 gap-x-8 gap-y-4">
              <Cell label="Pendidikan" value={p.pendidikan} />
              <Cell label="Lembaga" value={p.nama_lembaga} />
              <Cell label="Jurusan" value={p.jurusan} />
              <Cell label="Prev. Company" value={p.previous_company} />
              <Cell label="Pengalaman CC" value={p.pengalaman_cc} />
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-fg2 text-[10px] font-semibold uppercase tracking-[0.2em]">
                Data Sensitif
              </span>
              <div className="bg-border/60 h-px flex-1" />
            </div>
            <div className="grid grid-cols-3 gap-x-8 gap-y-4">
              <Cell label="No. KTP" value={p.no_ktp} />
              <Cell label="No. NPWP" value={p.no_npwp} />
              <Cell
                label="No. Rekening"
                value={
                  p.nomor_rekening
                    ? `${p.nomor_rekening}${
                        p.nama_bank ? ` · ${p.nama_bank}` : ""
                      }`
                    : null
                }
              />
              <Cell label="Status Hunian" value={p.status_tempat_tinggal} />
              <div className="col-span-2">
                <Cell
                  label="Alamat Tinggal"
                  value={p.alamat_tinggal}
                  multiline={true}
                />
              </div>
            </div>
          </div>

          <div className="mt-auto flex shrink-0 gap-4">
            {p.catatan_tambahan && (
              <div className="bg-surface border-border shadow-sm flex-1 rounded-xl border p-4">
                <p className="text-fg2 mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em]">
                  Catatan
                </p>
                <p className="text-fg2 line-clamp-2 text-[11px] font-medium leading-relaxed">
                  {p.catatan_tambahan}
                </p>
              </div>
            )}
            {p.keterangan && (
              <div className="bg-surface border-border shadow-sm flex-1 rounded-xl border p-4">
                <p className="text-fg2 mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em]">
                  Keterangan
                </p>
                <p className="text-fg2 line-clamp-2 text-[11px] font-medium leading-relaxed tracking-tight">
                  {p.keterangan}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return renderPolishedContent(p);
};
