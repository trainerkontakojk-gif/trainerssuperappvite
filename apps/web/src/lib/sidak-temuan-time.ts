import {
  durasiDetikSchema,
  jamSchema,
  SIDAK_TIME_SOURCE,
  type ServiceType,
  type TemuanWaktu,
} from "@trainers/types";

export const TEMUAN_JAM_HEADER = "Jam Layanan (HH:MM)";
export const TEMUAN_DURASI_HEADER = "Durasi (mm:ss)";

export function formatTemuanDuration(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function timeDraft(service: ServiceType, value: TemuanWaktu): string {
  if (SIDAK_TIME_SOURCE[service].kind === "durasi") {
    return value.durasi_detik == null
      ? ""
      : formatTemuanDuration(value.durasi_detik);
  }
  return value.jam_layanan ?? "";
}

export function parseTimeDraft(
  service: ServiceType,
  input: string,
): TemuanWaktu {
  const source = SIDAK_TIME_SOURCE[service];
  const text = input.trim();
  if (source.kind === "jam") {
    if (!text) return { jam_layanan: null };
    const result = jamSchema.safeParse(text);
    if (!result.success)
      throw new Error(
        `${source.label}: gunakan format 24 jam, misalnya 08:30.`,
      );
    return { jam_layanan: result.data };
  }
  if (source.kind === "durasi") {
    if (!text) return { durasi_detik: null };
    const match = /^(\d{1,4}):([0-5]\d)$/.exec(text);
    const seconds = match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
    if (!durasiDetikSchema.safeParse(seconds).success) {
      throw new Error(
        "Isi durasi kurang dari 24 jam dengan format mm:ss, misalnya 05:30.",
      );
    }
    return { durasi_detik: seconds };
  }
  return {};
}
