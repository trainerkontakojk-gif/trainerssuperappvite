import type { EfekProgram } from "@trainers/types";

/** One participant row read from an uploaded sheet, before name matching. */
export interface EfekImportRow {
  sheet: string;
  line: number;
  name: string;
  program_code: string;
  title: string;
  start_date: string;
  end_date: string;
}
export interface EfekImportProblem {
  sheet: string;
  line: number;
  message: string;
}

const MONTHS = [
  "januari",
  "februari",
  "maret",
  "april",
  "mei",
  "juni",
  "juli",
  "agustus",
  "september",
  "oktober",
  "november",
  "desember",
];
const MONTH_LABELS = MONTHS.map((m) => m[0]!.toUpperCase() + m.slice(1));

export const EFEK_TEMPLATE_HEADERS = [
  "Program",
  "Nama Sesi",
  "Tanggal Mulai",
  "Tanggal Selesai",
  "Nama Peserta",
] as const;

const COLUMN_ALIASES: Record<keyof Columns, string[]> = {
  name: ["nama peserta", "nama", "peserta", "nama agent", "agent"],
  program: ["program", "modul", "pelatihan"],
  title: ["nama sesi", "sesi", "judul sesi"],
  start: ["tanggal mulai", "tanggal", "mulai", "bulan sesi", "bulan"],
  end: ["tanggal selesai", "selesai"],
};
interface Columns {
  name: number;
  program: number;
  title: number;
  start: number;
  end: number;
}

const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Accepts `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, or a month name with an
 * optional year ("Mei 2026", "Mei"). A month alone means the first day of it.
 */
export function parseEfekDate(
  raw: string,
  fallbackYear: number,
): { start: string; monthOnly: boolean } | null {
  const text = norm(raw);
  if (!text) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!, false);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (m) return valid(+m[3]!, +m[2]!, +m[1]!, false);
  m = /^([a-z]+)(?:\s+(\d{4}))?$/.exec(text);
  if (m) {
    const month = MONTHS.findIndex(
      (name) => name === m![1] || name.slice(0, 3) === m![1],
    );
    if (month >= 0)
      return valid(m[2] ? +m[2] : fallbackYear, month + 1, 1, true);
  }
  return null;
}
function valid(y: number, mo: number, d: number, monthOnly: boolean) {
  if (mo < 1 || mo > 12 || d < 1 || d > lastDay(y, mo)) return null;
  return { start: `${y}-${pad(mo)}-${pad(d)}`, monthOnly };
}

function findColumns(header: string[]): Columns | null {
  const cells = header.map(norm);
  const find = (aliases: string[]) => {
    for (const alias of aliases) {
      const index = cells.indexOf(alias);
      if (index >= 0) return index;
    }
    return -1;
  };
  const columns = {
    name: find(COLUMN_ALIASES.name),
    program: find(COLUMN_ALIASES.program),
    title: find(COLUMN_ALIASES.title),
    start: find(COLUMN_ALIASES.start),
    end: find(COLUMN_ALIASES.end),
  };
  return columns.name >= 0 && columns.start >= 0 ? columns : null;
}

function programFor(value: string, programs: EfekProgram[]) {
  const text = norm(value);
  return programs.find((p) => p.code === text || norm(p.name) === text)?.code;
}

/**
 * Reads every sheet. A sheet needs a header row (within the first 10 rows)
 * with at least a name column and a date/month column. Program comes from a
 * Program column, or else from the sheet name (tabs KETIK, PDKT, TELEFUN, ...).
 */
export function parseEfekSheets(
  sheets: Record<string, string[][]>,
  programs: EfekProgram[],
  fallbackYear = new Date().getFullYear(),
): { rows: EfekImportRow[]; problems: EfekImportProblem[] } {
  const rows: EfekImportRow[] = [];
  const problems: EfekImportProblem[] = [];
  for (const [sheet, grid] of Object.entries(sheets)) {
    const headerIndex = grid
      .slice(0, 10)
      .findIndex((row) => findColumns(row) !== null);
    if (headerIndex < 0) {
      if (grid.some((row) => row.some((cell) => cell.trim())))
        problems.push({
          sheet,
          line: 1,
          message:
            "Kolom Nama Peserta dan Tanggal Mulai (atau Bulan) tidak ditemukan.",
        });
      continue;
    }
    const columns = findColumns(grid[headerIndex]!)!;
    const sheetProgram = programFor(sheet, programs);
    grid.slice(headerIndex + 1).forEach((row, i) => {
      const line = headerIndex + i + 2;
      const cell = (index: number) =>
        index >= 0 ? (row[index] ?? "").trim() : "";
      const name = cell(columns.name).replace(/\s+/g, " ");
      if (!name) return;
      const programText = cell(columns.program);
      const program_code = programText
        ? programFor(programText, programs)
        : sheetProgram;
      if (!program_code) {
        problems.push({
          sheet,
          line,
          message: programText
            ? `Program "${programText}" tidak dikenal.`
            : "Program kosong dan nama sheet bukan nama program.",
        });
        return;
      }
      const start = parseEfekDate(cell(columns.start), fallbackYear);
      if (!start) {
        problems.push({ sheet, line, message: "Tanggal mulai tidak terbaca." });
        return;
      }
      const endText = cell(columns.end);
      const end = endText ? parseEfekDate(endText, fallbackYear) : null;
      if (endText && !end) {
        problems.push({
          sheet,
          line,
          message: "Tanggal selesai tidak terbaca.",
        });
        return;
      }
      const [y, mo] = start.start.split("-").map(Number) as [number, number];
      const title = cell(columns.title) || `Sesi ${MONTH_LABELS[mo - 1]} ${y}`;
      rows.push({
        sheet,
        line,
        name,
        program_code,
        title,
        start_date: start.start,
        end_date: end?.start ?? start.start,
      });
    });
  }
  return { rows, problems };
}

export const efekSessionKey = (r: {
  program_code: string;
  title: string;
  start_date: string;
}) => `${r.program_code}|${norm(r.title)}|${r.start_date}`;
