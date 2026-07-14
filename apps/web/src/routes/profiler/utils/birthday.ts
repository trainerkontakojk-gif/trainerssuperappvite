import type { ProfilerPeserta } from "@trainers/types";

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long" });
}

export function getDaysUntilBirthday(tglLahir: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dob = new Date(tglLahir);
  const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

export function getAgeAtNextBirthday(tglLahir: string): number {
  const today = new Date();
  const dob = new Date(tglLahir);
  const nextYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() > dob.getDate())
      ? today.getFullYear() + 1
      : today.getFullYear();
  return nextYear - dob.getFullYear();
}

export interface BirthdayEntry {
  nama: string;
  tglLahir: string;
  days: number;
  age: number;
}

export function getUpcomingBirthdays(
  pesertaList: ProfilerPeserta[],
  limit = 5,
): BirthdayEntry[] {
  const today = new Date();
  return pesertaList
    .filter((p) => p.tgl_lahir)
    .map((p) => {
      const days = getDaysUntilBirthday(p.tgl_lahir!);
      return {
        nama: p.nama || "Unknown",
        tglLahir: p.tgl_lahir!,
        days,
        age: getAgeAtNextBirthday(p.tgl_lahir!),
      };
    })
    .sort((a, b) => a.days - b.days)
    .slice(0, limit);
}
