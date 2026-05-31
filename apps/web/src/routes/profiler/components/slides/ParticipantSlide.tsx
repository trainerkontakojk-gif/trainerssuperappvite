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
      {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
      <span className="text-[9px] font-bold uppercase leading-none tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
    <span
      className={`text-xs font-semibold leading-tight text-gray-900 dark:text-gray-100 ${
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
    const headlineGradient = {
      background: `linear-gradient(160deg, ${theme.accent}14 0%, ${theme.accent}08 36%, transparent 100%)`,
    };

    return (
      <div
        className="relative flex flex-1 overflow-hidden"
        style={headlineGradient}
      >
        <div
          className="absolute -left-20 -top-20 h-56 w-56 rounded-full blur-3xl"
          style={{ background: `${theme.accent}24` }}
        />
        <div className="bg-primary/10 absolute -right-20 bottom-[-7rem] h-64 w-64 rounded-full blur-3xl" />

        <div className="relative z-10 box-border flex flex-1 flex-col gap-5 overflow-y-auto p-7">
          <section className="bg-card/80 dark:border-white/10 dark:bg-card/55 rounded-[1.5rem] border border-white/45 p-5 shadow-lg backdrop-blur-xl">
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[132px_1fr]">
              {p.foto_url ? (
                <div
                  className="ring-card relative h-40 w-40 overflow-hidden rounded-[2rem] shadow-xl ring-[5px]"
                  style={{ boxShadow: `0 10px 24px ${theme.accent}32` }}
                >
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
                  className="ring-card flex h-40 w-40 items-center justify-center rounded-[2rem] text-5xl font-black shadow-lg ring-[5px]"
                  style={{
                    background: theme.light,
                    color: theme.accent,
                    border: `1px solid ${theme.accent}40`,
                  }}
                >
                  {p.nama?.charAt(0)}
                </div>
              )}

              <div>
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.24em]"
                  style={{ color: theme.accent }}
                >
                  Opsi 2 · Portrait A4
                </p>
                <h3 className="text-foreground mt-2 text-3xl font-black leading-tight tracking-tight">
                  {p.nama}
                </h3>
                <p className="text-muted-foreground mt-2 text-[11px] font-bold uppercase tracking-[0.2em]">
                  {labelJabatan[p.jabatan || ""] || p.jabatan} · {theme.label}
                </p>
                <div className="text-muted-foreground mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.15em]">
                  <span className="border-border/50 bg-background/75 rounded-full border px-2.5 py-1">
                    Masa dinas:{" "}
                    {p.bergabung_date
                      ? hitungMasaDinas(p.bergabung_date)
                      : "-"}
                  </span>
                  <span className="border-border/50 bg-background/75 rounded-full border px-2.5 py-1">
                    Usia: {p.tgl_lahir ? `${hitungUsia(p.tgl_lahir)} tahun` : "-"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-card/80 dark:border-white/10 dark:bg-card/55 rounded-[1.5rem] border border-white/45 p-5 shadow-lg backdrop-blur-xl">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.24em]"
              style={{ color: theme.accent }}
            >
              Identitas dan Kontak
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <section className="border-border bg-muted/10 rounded-[1.5rem] border p-5 shadow-lg">
            <p className="text-primary text-[10px] font-bold uppercase tracking-[0.24em]">
              Data Pribadi dan Latar Belakang
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <section className="bg-destructive/10 border-destructive/20 rounded-[1.5rem] border p-5 shadow-sm">
            <p className="text-destructive text-[10px] font-bold uppercase tracking-[0.24em]">
              Data Sensitif
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="bg-amber-500/10 border-amber-500/25 rounded-[1.4rem] border p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-400">
                Catatan Tambahan
              </p>
              <p className="text-foreground/85 mt-2 text-sm leading-6">
                {p.catatan_tambahan || "Tidak ada catatan tambahan."}
              </p>
            </div>
            <div className="border-border/55 bg-card/75 rounded-[1.4rem] border p-4 shadow-sm">
              <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.24em]">
                Keterangan Internal
              </p>
              <p className="text-foreground/80 mt-2 text-sm leading-6">
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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* LEFT SIDEBAR 30% */}
        <div className="bg-muted/20 border-border/40 flex w-[30%] shrink-0 flex-col items-center gap-6 overflow-y-auto border-r box-border px-6 pb-12 pt-8">
          {p.foto_url ? (
            <div
              className="ring-card relative h-32 w-32 shrink-0 overflow-hidden rounded-[2rem] shadow-lg ring-[6px]"
              style={{ boxShadow: `0 8px 24px ${theme.accent}30` }}
            >
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
              className="ring-card flex h-32 w-32 shrink-0 items-center justify-center rounded-[2rem] text-4xl font-bold shadow-md ring-[6px]"
              style={{
                background: theme.light,
                color: theme.accent,
                border: `1px solid ${theme.accent}40`,
              }}
            >
              {p.nama?.charAt(0)}
            </div>
          )}

          <div className="w-full shrink-0 text-center">
            <h2 className="text-foreground truncate text-2xl font-black leading-tight tracking-tight">
              {p.nama}
            </h2>
            <p
              className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-80"
              style={{ color: theme.accent }}
            >
              {labelJabatan[p.jabatan || ""] || p.jabatan}
            </p>
            <div
              className="bg-card border-border/40 mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-bold shadow-sm"
              style={{ fontSize: "9px", color: theme.accent }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: theme.accent }}
              />
              {theme.label}
            </div>
          </div>

          <div className="bg-card border-border/40 w-full shrink-0 rounded-3xl border p-4 text-center shadow-sm">
            <p className="text-muted-foreground mb-1 text-[9px] font-bold uppercase tracking-[0.15em]">
              Masa Dinas
            </p>
            <p className="text-foreground text-[22px] font-black leading-none tracking-tight">
              {p.bergabung_date ? hitungMasaDinas(p.bergabung_date) : "-"}
            </p>
            <p className="text-muted-foreground mt-1.5 text-[10px] font-medium tracking-tight">
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
                  <span className="text-muted-foreground shrink-0 text-[9px] font-bold uppercase tracking-widest">
                    {label}
                  </span>
                  <span className="text-foreground/80 truncate text-right text-[10px] font-bold tracking-tight">
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
              <span className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em]">
                Data Pekerjaan
              </span>
              <div className="bg-border/40 h-px flex-1" />
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
              <span className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em]">
                Latar Belakang
              </span>
              <div className="bg-border/40 h-px flex-1" />
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
              <span className="text-destructive text-[10px] font-black uppercase tracking-[0.2em]">
                🔒 Data Sensitif
              </span>
              <div className="bg-destructive/20 h-px flex-1" />
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
              <div className="bg-amber-500/10 border-amber-500/20 shadow-sm flex-1 rounded-3xl border p-4">
                <p className="text-amber-600 dark:text-amber-500 mb-1.5 text-[9px] font-black uppercase tracking-[0.2em]">
                  ⭐ Catatan
                </p>
                <p className="text-amber-900 dark:text-amber-200/80 line-clamp-2 text-[11px] font-medium leading-relaxed">
                  {p.catatan_tambahan}
                </p>
              </div>
            )}
            {p.keterangan && (
              <div className="bg-muted/30 border-border/40 shadow-sm flex-1 rounded-3xl border p-4">
                <p className="text-muted-foreground mb-1.5 text-[9px] font-black uppercase tracking-[0.2em]">
                  Keterangan
                </p>
                <p className="text-foreground/70 line-clamp-2 text-[11px] font-medium leading-relaxed tracking-tight">
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
