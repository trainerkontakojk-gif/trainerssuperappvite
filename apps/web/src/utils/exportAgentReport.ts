/**
 * Pintu masuk unduhan laporan agen (SIDAK).
 *
 * Format yang ditawarkan menu "Unduh Laporan": Excel (.xlsx), HTML Interaktif,
 * HTML Statis, dan PDF. Excel menggantikan CSV multi-seksi dan Markdown; isi
 * semua format berasal dari snapshot dan model yang sama
 * (`agentReportModel.ts`). Generator Excel dan PDF ada di modulnya sendiri dan
 * diimpor dinamis oleh hook, jadi `exceljs`/`jspdf` hanya dimuat saat dipilih.
 */

import type {
  AgentDetailData,
  AgentPeriodSummary,
  RootCauseResult,
} from "@trainers/types";
import { buildAgentReportHtml } from "./agentReportHtml";
import type {
  AgentHtmlExportContext,
  AgentHtmlVariant,
  TicketScoreExport,
  TemuanDisplayItemExport,
} from "./agentReportHtml";

export type {
  AgentHtmlExportContext,
  TicketScoreExport,
  TemuanDisplayItemExport,
} from "./agentReportHtml";

export type AgentReportFormat =
  | "xlsx"
  | "html-interactive"
  | "html-static"
  | "pdf";

// ---------------------------------------------------------------------------
// Nama file
// ---------------------------------------------------------------------------

/**
 * Karakter yang merusak nama file lintas OS/path: separator direktori, wildcard,
 * dan reserved Windows. Karakter kontrol ditangani terpisah lewat
 * `isControlCode` supaya tidak butuh regex control-character.
 */
const UNSAFE_FILENAME_CHARS = new Set([
  "/",
  "\\",
  ":",
  "*",
  "?",
  '"',
  "<",
  ">",
  "|",
]);

function isControlCode(code: number): boolean {
  return code < 0x20 || code === 0x7f;
}

export function sanitizeReportFilePart(
  value: string | null | undefined,
  fallback: string,
): string {
  // Satu garis bawah per RENTETAN karakter berbahaya, jadi
  // `Rina/Adi:*?"<>|Bunga` menjadi `Rina_Adi_Bunga`, bukan `Rina_Adi______Bunga`.
  let out = "";
  let pendingSeparator = false;
  for (const char of String(value ?? "")) {
    const code = char.codePointAt(0) ?? 0;
    if (UNSAFE_FILENAME_CHARS.has(char) || isControlCode(code)) {
      if (out.length > 0) pendingSeparator = true;
      continue;
    }
    if (pendingSeparator) {
      out += "_";
      pendingSeparator = false;
    }
    out += char;
  }

  const cleaned = out
    .slice(0, 120)
    .replace(/\s+/g, " ")
    .trim()
    // Nama file/folder tidak boleh diawali atau diakhiri titik, spasi, garis,
    // atau underscore (`.hidden`, `CON`, `trailing .`).
    .replace(/^[.\-_\s]+|[.\-_\s]+$/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}


export function buildAgentReportFileName(options: {
  agentName: string | null | undefined;
  agentId: string;
  year: number;
  extension: string;
}): string {
  const { agentName, agentId, year, extension } = options;
  const safeAgentId = sanitizeReportFilePart(agentId, "agent");
  const safeAgentName = sanitizeReportFilePart(agentName, safeAgentId);
  return `Laporan_Audit_${safeAgentName}_${year}.${extension}`;
}

// ---------------------------------------------------------------------------
// generateHTML
// ---------------------------------------------------------------------------

/**
 * Pintu masuk HTML untuk kedua varian.
 *
 * Seluruh desain laporan (stylesheet, kerangka markup, dan script interaktif)
 * hidup di `agentReportHtml.ts` supaya hanya ada SATU sumber desain. Fungsi ini
 * tidak merakit apa pun: ia hanya meneruskan snapshot yang sama ke builder itu.
 */
export function generateHTML(
  data: AgentDetailData,
  monthlySummaries: AgentPeriodSummary[],
  temuanDisplayItems: TemuanDisplayItemExport[],
  topTickets: TicketScoreExport[],
  activeRootCauses: RootCauseResult[],
  selectedYear: number,
  selectedService: string,
  variant: AgentHtmlVariant = "static",
  context: AgentHtmlExportContext = {},
): string {
  return buildAgentReportHtml({
    data,
    monthlySummaries,
    temuanDisplayItems,
    topTickets,
    activeRootCauses,
    selectedYear,
    selectedService,
    variant,
    context,
  });
}
