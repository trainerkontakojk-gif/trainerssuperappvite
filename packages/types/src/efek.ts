import { z } from "zod";
import { serviceTypeSchema, tanggalSchema, type ServiceType } from "./sidak";

/** EFEK (Evaluasi Efektivitas dan Kinerja): training sessions and participants. */
export const efekProgramCodeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{1,31}$/);

export const EFEK_MAX_PARTICIPANTS = 300;
export const EFEK_MAX_IMPORT_SESSIONS = 50;
export const EFEK_MAX_MATCH_NAMES = 1000;

const pesertaIds = z
  .array(z.string().uuid())
  .min(1)
  .max(EFEK_MAX_PARTICIPANTS)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Peserta tidak boleh ganda",
  });

const sessionFields = z
  .object({
    program_code: efekProgramCodeSchema,
    title: z.string().trim().min(3).max(160),
    service_type: serviceTypeSchema,
    start_date: tanggalSchema,
    end_date: tanggalSchema,
    peserta_ids: pesertaIds,
  })
  .strict();

const validDates = (s: { start_date: string; end_date: string }) =>
  s.end_date >= s.start_date &&
  (Date.parse(s.end_date) - Date.parse(s.start_date)) / 86_400_000 <= 92;
const datesIssue = {
  message: "Tanggal selesai harus sama atau setelah mulai, paling lama 92 hari",
  path: ["end_date"],
};

export const efekSessionInputSchema = sessionFields.refine(
  validDates,
  datesIssue,
);
export type EfekSessionInput = z.infer<typeof efekSessionInputSchema>;

export const efekImportInputSchema = z
  .object({
    sessions: z
      .array(efekSessionInputSchema)
      .min(1)
      .max(EFEK_MAX_IMPORT_SESSIONS),
  })
  .strict();
export type EfekImportInput = z.infer<typeof efekImportInputSchema>;

export const efekMatchInputSchema = z
  .object({
    names: z
      .array(z.string().trim().min(1).max(120))
      .min(1)
      .max(EFEK_MAX_MATCH_NAMES),
  })
  .strict();
export type EfekMatchInput = z.infer<typeof efekMatchInputSchema>;

export interface EfekProgram {
  code: string;
  name: string;
  default_service_type: ServiceType;
  sort_order: number;
}

export interface EfekSession {
  id: string;
  program_code: string;
  title: string;
  service_type: ServiceType;
  start_date: string;
  end_date: string;
  participant_count: number;
  updated_at: string;
}

export interface EfekParticipant {
  peserta_id: string;
  nama: string;
  tim: string | null;
}

export interface EfekSessionDetail extends EfekSession {
  participants: EfekParticipant[];
}

export interface EfekPesertaOption {
  id: string;
  nama: string;
  tim: string | null;
}

/**
 * `cocok`: exactly one Profiler name equals the input (case/spacing ignored).
 * `pilih`: several exact matches, or only similar names; the trainer chooses.
 * `tidak_ditemukan`: nothing close; the row is skipped.
 */
export type EfekMatchStatus = "cocok" | "pilih" | "tidak_ditemukan";
export interface EfekNameMatch {
  name: string;
  status: EfekMatchStatus;
  candidates: EfekPesertaOption[];
}

/** Phase 2 report (plans/markdown/efek.md). Scores come from SIDAK monthly summaries. */
export const EFEK_MAX_WINDOW = 6;
export const efekReportQuerySchema = z
  .object({
    window: z.coerce.number().int().min(1).max(EFEK_MAX_WINDOW).default(3),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    tim: z.string().trim().min(1).max(100).optional(),
    session: z.string().uuid().optional(),
  })
  .strict();
export type EfekReportQuery = z.infer<typeof efekReportQuerySchema>;

export interface EfekMonth {
  year: number;
  month: number;
}

/** `menunggu`: no month after training has closed. `tanpa_data`: a side has no SIDAK data. */
export type EfekParticipantStatus =
  | "naik"
  | "stabil"
  | "turun"
  | "menunggu"
  | "tanpa_data";

export interface EfekMonthPoint extends EfekMonth {
  /** −W..−1 before, 0 training, +1..+W after. */
  offset: number;
  score: number | null;
  sessions: number;
  findings: number;
  comparison_score: number | null;
}

export interface EfekParticipantResult {
  session_id: string;
  peserta_id: string;
  nama: string;
  tim: string | null;
  session_title: string;
  service_type: ServiceType;
  start_date: string;
  end_date: string;
  months_before: number;
  months_after: number;
  sessions_before: number;
  sessions_after: number;
  findings_before: number;
  findings_after: number;
  score_before: number | null;
  score_after: number | null;
  findings_per_session_before: number | null;
  findings_per_session_after: number | null;
  delta: number | null;
  comparison_delta: number | null;
  relative_delta: number | null;
  status: EfekParticipantStatus;
  thin: boolean;
  months: EfekMonthPoint[];
}

export interface EfekProgramSummary {
  code: string;
  name: string;
  service_type: ServiceType;
  participants: number;
  evaluated: number;
  pending: number;
  naik: number;
  stabil: number;
  turun: number;
  avg_delta: number | null;
  avg_relative_delta: number | null;
  findings_per_session_before: number | null;
  findings_per_session_after: number | null;
}

/** `terukur`: every after month closed; `sebagian`: some; `menunggu`: none yet. */
export type EfekSessionStatus = "terukur" | "sebagian" | "menunggu";
export interface EfekSessionSummary {
  id: string;
  program_code: string;
  title: string;
  service_type: ServiceType;
  start_date: string;
  end_date: string;
  participants: number;
  evaluated: number;
  avg_delta: number | null;
  status: EfekSessionStatus;
  months_after_closed: number;
  first_after: EfekMonth;
}

export interface EfekChartPoint {
  offset: number;
  score: number | null;
  comparison_score: number | null;
  findings_per_session: number | null;
  comparison_findings_per_session: number | null;
}

export interface EfekReport {
  data_until: EfekMonth;
  window: number;
  teams: string[];
  years: number[];
  programs: EfekProgramSummary[];
  sessions: EfekSessionSummary[];
}

export interface EfekProgramReport extends Omit<EfekReport, "programs"> {
  program: EfekProgramSummary;
  chart: EfekChartPoint[];
  participants: EfekParticipantResult[];
}
