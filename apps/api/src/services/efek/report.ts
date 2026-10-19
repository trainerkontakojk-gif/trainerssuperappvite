import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EfekChartPoint,
  EfekMonth,
  EfekMonthPoint,
  EfekParticipantResult,
  EfekParticipantStatus,
  EfekProgram,
  EfekProgramReport,
  EfekProgramSummary,
  EfekReport,
  EfekReportQuery,
  EfekSessionSummary,
  ServiceType,
} from "@trainers/types";
import {
  calculateQAScoreFromTemuan,
  DEFAULT_SERVICE_WEIGHTS,
  isAgentExcluded,
} from "../../lib/scoring";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { getScoreRows } from "../sidak/dashboard-aggregation";
import { getIndicators, getPeriods } from "../sidak/period-indicator";
import {
  createPeriodScoringLoaders,
  loadPeriodScoringContext,
  mergeServiceWeights,
  normalizePeriodScoringRows,
  type PeriodScoringContext,
} from "../sidak/period-scoring-context";
import { isCountableFinding } from "../sidak/shared-constants";
import { TnaServiceError } from "../tna/errors";
import { listEfekPrograms } from "./sessions";

/**
 * EFEK phase 2 (plans/markdown/efek.md): compares each participant's SIDAK
 * monthly score before and after training with agents of the same service
 * who never joined that program. Temuan reads use the caller JWT (RLS
 * admin/trainer); scoring rules come from the shared SIDAK loaders.
 */

const CHANGE_THRESHOLD = 1;
const THIN_SESSIONS = 5;

/** Months as one integer (year * 12 + month − 1) so windows are plain ranges. */
const monthIndex = (year: number, month: number) => year * 12 + month - 1;
const dateMonth = (date: string) =>
  monthIndex(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
const toMonth = (index: number): EfekMonth => ({
  year: Math.floor(index / 12),
  month: (index % 12) + 1,
});
/** The running Asia/Jakarta month; it and later months never count. */
export function currentEfekMonth(now = new Date()) {
  const jakarta = new Date(now.getTime() + 7 * 3_600_000);
  return monthIndex(jakarta.getUTCFullYear(), jakarta.getUTCMonth() + 1);
}

const round = (n: number) => Math.round(n * 100) / 100;
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const ratio = (findings: number, sessions: number) =>
  sessions > 0 ? findings / sessions : null;
const roundOrNull = (n: number | null) => (n === null ? null : round(n));

interface SessionRow {
  id: string;
  program_code: string;
  title: string;
  service_type: ServiceType;
  start_date: string;
  end_date: string;
  efek_participants: {
    peserta_id: string;
    profiler_peserta: { nama: string; tim: string | null } | null;
  }[];
}
interface TemuanRow {
  id: string;
  peserta_id: string;
  period_id: string;
  indicator_id: string;
  rule_indicator_id: string | null;
  nilai: number | null;
  no_tiket: string | null;
  created_at: string;
  is_phantom_padding: boolean | null;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
  profiler_peserta: {
    tim: string | null;
    batch_name: string | null;
    jabatan: string | null;
  } | null;
}
interface MonthStat {
  score: number;
  sessions: number;
  findings: number;
}
interface Comparison {
  score: number | null;
  findingsPerSession: number | null;
}
type Point = EfekMonthPoint & { comparison_fps: number | null };
type Result = Omit<EfekParticipantResult, "months"> & {
  program_code: string;
  raw_delta: number | null;
  raw_relative: number | null;
  months: Point[];
};

async function loadSessions(supabase: SupabaseClient, program?: string) {
  return fetchAllPages<SessionRow>({
    build: ({ from, to }) => {
      let query = supabase
        .from("efek_sessions")
        .select(
          "id, program_code, title, service_type, start_date, end_date, efek_participants(peserta_id, profiler_peserta(nama, tim))",
        )
        .order("start_date", { ascending: false })
        .order("id")
        .range(from, to);
      if (program) query = query.eq("program_code", program);
      return query as unknown as PromiseLike<{
        data: SessionRow[] | null;
        error: { message: string } | null;
      }>;
    },
  });
}

/**
 * Monthly SIDAK stats keyed `service|agent|month` for the months in range,
 * scored from raw temuan exactly like the SIDAK agent page (rule version per
 * period, worst five sessions). `qa_dashboard_agent_period_summary` is only a
 * cache: rows written by the SQL refresh carry final_score 0 and imports never
 * refresh it, so reading it gave impossible averages and missing months.
 */
async function loadScores(
  supabase: SupabaseClient,
  services: ServiceType[],
  first: number,
  last: number,
) {
  const byAgent = new Map<string, MonthStat>();
  const byMonth = new Map<string, (MonthStat & { agent: string })[]>();
  if (!services.length || first > last) return { byAgent, byMonth };
  const [periods, indicators, weights] = await Promise.all([
    getPeriods(),
    getIndicators(),
    supabase.from("qa_service_weights").select("*"),
  ]);
  if (weights.error) throw weights.error;
  const resolvedWeights = mergeServiceWeights(
    DEFAULT_SERVICE_WEIGHTS,
    weights.data ?? [],
  );
  const periodMonth = new Map<string, number>();
  for (const p of periods) {
    const index = monthIndex(p.year, p.month);
    if (index >= first && index <= last) periodMonth.set(p.id, index);
  }
  if (!periodMonth.size) return { byAgent, byMonth };
  const loaders = createPeriodScoringLoaders(periods);

  for (const service of services) {
    const rows = await loadTemuan(supabase, service, [...periodMonth.keys()]);
    const groups = new Map<string, TemuanRow[]>();
    for (const row of rows) {
      const key = `${row.period_id}|${row.peserta_id}`;
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }
    const contexts = new Map<string, Promise<PeriodScoringContext>>();
    for (const [key, group] of groups) {
      const [periodId, agent] = key.split("|") as [string, string];
      if (!contexts.has(periodId))
        contexts.set(
          periodId,
          loadPeriodScoringContext(
            service,
            periodId,
            indicators,
            resolvedWeights[service],
            loaders,
          ),
        );
      const context = await contexts.get(periodId)!;
      const score = calculateQAScoreFromTemuan(
        context.indicators,
        normalizePeriodScoringRows(getScoreRows(group), context),
        context.weight,
      );
      if (!score.sessionCount) continue;
      const index = periodMonth.get(periodId)!;
      const stat = {
        score: score.finalScore,
        sessions: score.sessionCount,
        findings: group.filter((r) => isCountableFinding(r)).length,
      };
      byAgent.set(`${service}|${agent}|${index}`, stat);
      // QA, trainers, leaders and other excluded staff are never peers.
      const p = group[0]!.profiler_peserta;
      if (isAgentExcluded(p?.tim, p?.batch_name, p?.jabatan)) continue;
      const monthKey = `${service}|${index}`;
      byMonth.set(monthKey, [
        ...(byMonth.get(monthKey) ?? []),
        { ...stat, agent },
      ]);
    }
  }
  return { byAgent, byMonth };
}

const TEMUAN_PAGE = 1000;

/** One service's temuan for the given periods, keyset-paged by id. */
async function loadTemuan(
  supabase: SupabaseClient,
  service: ServiceType,
  periodIds: string[],
) {
  const rows: TemuanRow[] = [];
  let lastId: string | null = null;
  for (;;) {
    let query = supabase
      .from("qa_temuan")
      .select(
        "id, peserta_id, period_id, indicator_id, rule_indicator_id, nilai, no_tiket, created_at, is_phantom_padding, ketidaksesuaian, sebaiknya, profiler_peserta!inner(tim, batch_name, jabatan)",
      )
      .eq("service_type", service)
      .in("period_id", periodIds)
      .order("id")
      .limit(TEMUAN_PAGE);
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as unknown as TemuanRow[];
    rows.push(...page);
    if (page.length < TEMUAN_PAGE) return rows;
    lastId = page[page.length - 1]!.id;
  }
}

interface Built {
  current: number;
  window: number;
  sessions: SessionRow[];
  allSessions: SessionRow[];
  results: Result[];
}

async function build(
  supabase: SupabaseClient,
  query: EfekReportQuery,
  program?: string,
): Promise<Built> {
  const { window } = query;
  const current = currentEfekMonth();
  const allSessions = await loadSessions(supabase, program);
  const programPeople = new Map<string, Set<string>>();
  for (const s of allSessions) {
    const set = programPeople.get(s.program_code) ?? new Set<string>();
    s.efek_participants.forEach((p) => set.add(p.peserta_id));
    programPeople.set(s.program_code, set);
  }
  const sessions = allSessions
    .filter(
      (s) =>
        (!query.year || Number(s.start_date.slice(0, 4)) === query.year) &&
        (!query.session || s.id === query.session),
    )
    .map((s) => ({
      ...s,
      efek_participants: s.efek_participants.filter(
        (p) => !query.tim || p.profiler_peserta?.tim === query.tim,
      ),
    }))
    .filter((s) => !query.tim || s.efek_participants.length > 0);

  const first = Math.min(
    ...sessions.map((s) => dateMonth(s.start_date) - window),
  );
  const last = Math.min(
    current - 1,
    Math.max(...sessions.map((s) => dateMonth(s.end_date) + window)),
  );
  const services = [...new Set(sessions.map((s) => s.service_type))];
  const scores = await loadScores(supabase, services, first, last);

  const comparisons = new Map<string, Comparison>();
  const comparison = (code: string, service: string, index: number) => {
    const key = `${code}|${service}|${index}`;
    if (!comparisons.has(key)) {
      const exclude = programPeople.get(code) ?? new Set();
      const others = (scores.byMonth.get(`${service}|${index}`) ?? []).filter(
        (r) => !exclude.has(r.agent),
      );
      comparisons.set(key, {
        score: mean(others.map((r) => r.score)),
        findingsPerSession: ratio(
          others.reduce((n, r) => n + r.findings, 0),
          others.reduce((n, r) => n + r.sessions, 0),
        ),
      });
    }
    return comparisons.get(key)!;
  };

  const results: Result[] = [];
  for (const s of sessions) {
    const start = dateMonth(s.start_date);
    const end = dateMonth(s.end_date);
    const slots: { index: number; offset: number }[] = [];
    for (let k = window; k >= 1; k--)
      slots.push({ index: start - k, offset: -k });
    for (let index = start; index <= end; index++)
      slots.push({ index, offset: 0 });
    for (let k = 1; k <= window; k++) slots.push({ index: end + k, offset: k });
    const closedAfter = slots.filter(
      (m) => m.offset > 0 && m.index < current,
    ).length;

    for (const person of s.efek_participants) {
      const months: Point[] = slots
        .filter((m) => m.index < current)
        .map(({ index, offset }) => {
          const stat = scores.byAgent.get(
            `${s.service_type}|${person.peserta_id}|${index}`,
          );
          const other = comparison(s.program_code, s.service_type, index);
          return {
            ...toMonth(index),
            offset,
            score: stat?.score ?? null,
            sessions: stat?.sessions ?? 0,
            findings: stat?.findings ?? 0,
            comparison_score: roundOrNull(other.score),
            comparison_fps: other.findingsPerSession,
          };
        });
      const side = (before: boolean) => {
        const list = months.filter(
          (m) => m.score !== null && (before ? m.offset < 0 : m.offset > 0),
        );
        const compared = list
          .map(
            (m) =>
              comparison(
                s.program_code,
                s.service_type,
                monthIndex(m.year, m.month),
              ).score,
          )
          .filter((v): v is number => v !== null);
        return {
          months: list.length,
          sessions: list.reduce((n, m) => n + m.sessions, 0),
          findings: list.reduce((n, m) => n + m.findings, 0),
          score: mean(list.map((m) => m.score!)),
          comparison: compared.length ? mean(compared) : null,
        };
      };
      const before = side(true);
      const after = side(false);
      let status: EfekParticipantStatus;
      let rawDelta: number | null = null;
      if (closedAfter === 0) status = "menunggu";
      else if (!before.months || !after.months) status = "tanpa_data";
      else {
        rawDelta = after.score! - before.score!;
        const delta = round(rawDelta);
        status =
          delta >= CHANGE_THRESHOLD
            ? "naik"
            : delta <= -CHANGE_THRESHOLD
              ? "turun"
              : "stabil";
      }
      const comparisonDelta =
        rawDelta !== null &&
        before.comparison !== null &&
        after.comparison !== null
          ? after.comparison - before.comparison
          : null;
      const rawRelative =
        comparisonDelta === null ? null : rawDelta! - comparisonDelta;
      results.push({
        session_id: s.id,
        program_code: s.program_code,
        peserta_id: person.peserta_id,
        nama: person.profiler_peserta?.nama ?? "",
        tim: person.profiler_peserta?.tim ?? null,
        session_title: s.title,
        service_type: s.service_type,
        start_date: s.start_date,
        end_date: s.end_date,
        months_before: before.months,
        months_after: after.months,
        sessions_before: before.sessions,
        sessions_after: after.sessions,
        findings_before: before.findings,
        findings_after: after.findings,
        score_before: roundOrNull(before.score),
        score_after: roundOrNull(after.score),
        findings_per_session_before: roundOrNull(
          ratio(before.findings, before.sessions),
        ),
        findings_per_session_after: roundOrNull(
          ratio(after.findings, after.sessions),
        ),
        delta: roundOrNull(rawDelta),
        comparison_delta: roundOrNull(comparisonDelta),
        relative_delta: roundOrNull(rawRelative),
        status,
        thin:
          rawDelta !== null &&
          (before.months === 1 ||
            after.months === 1 ||
            before.sessions < THIN_SESSIONS ||
            after.sessions < THIN_SESSIONS),
        raw_delta: rawDelta,
        raw_relative: rawRelative,
        months,
      });
    }
  }
  return { current, window, sessions, allSessions, results };
}

const isEvaluated = (r: Result) => r.raw_delta !== null;

function summarize(
  program: EfekProgram,
  results: Result[],
): EfekProgramSummary {
  const evaluated = results.filter(isEvaluated);
  const count = (status: EfekParticipantStatus) =>
    results.filter((r) => r.status === status).length;
  const sum = (pick: (r: Result) => number) =>
    evaluated.reduce((n, r) => n + pick(r), 0);
  return {
    code: program.code,
    name: program.name,
    service_type: program.default_service_type,
    participants: results.length,
    evaluated: evaluated.length,
    pending: count("menunggu"),
    naik: count("naik"),
    stabil: count("stabil"),
    turun: count("turun"),
    avg_delta: roundOrNull(mean(evaluated.map((r) => r.raw_delta!))),
    avg_relative_delta: roundOrNull(
      mean(
        evaluated
          .map((r) => r.raw_relative)
          .filter((v): v is number => v !== null),
      ),
    ),
    findings_per_session_before: roundOrNull(
      ratio(
        sum((r) => r.findings_before),
        sum((r) => r.sessions_before),
      ),
    ),
    findings_per_session_after: roundOrNull(
      ratio(
        sum((r) => r.findings_after),
        sum((r) => r.sessions_after),
      ),
    ),
  };
}

function sessionSummaries(built: Built): EfekSessionSummary[] {
  return built.sessions.map((s) => {
    const own = built.results.filter((r) => r.session_id === s.id);
    const evaluated = own.filter(isEvaluated);
    const end = dateMonth(s.end_date);
    const closed = Math.max(0, Math.min(built.window, built.current - 1 - end));
    return {
      id: s.id,
      program_code: s.program_code,
      title: s.title,
      service_type: s.service_type,
      start_date: s.start_date,
      end_date: s.end_date,
      participants: own.length,
      evaluated: evaluated.length,
      avg_delta: roundOrNull(mean(evaluated.map((r) => r.raw_delta!))),
      status:
        closed === 0
          ? "menunggu"
          : closed < built.window
            ? "sebagian"
            : "terukur",
      months_after_closed: closed,
      first_after: toMonth(end + 1),
    };
  });
}

function header(built: Built) {
  const teams = new Set<string>();
  for (const s of built.allSessions)
    for (const p of s.efek_participants)
      if (p.profiler_peserta?.tim) teams.add(p.profiler_peserta.tim);
  return {
    data_until: toMonth(built.current - 1),
    window: built.window,
    teams: [...teams].sort((a, b) => a.localeCompare(b, "id")),
    years: [
      ...new Set(
        built.allSessions.map((s) => Number(s.start_date.slice(0, 4))),
      ),
    ].sort((a, b) => b - a),
  };
}

function publicResult({
  program_code: _program,
  raw_delta: _delta,
  raw_relative: _relative,
  months,
  ...rest
}: Result): EfekParticipantResult {
  return {
    ...rest,
    months: months.map(({ comparison_fps: _fps, ...m }) => m),
  };
}

function chart(built: Built): EfekChartPoint[] {
  const points: EfekChartPoint[] = [];
  for (let offset = -built.window; offset <= built.window; offset++) {
    const here = built.results.flatMap((r) =>
      r.months.filter((m) => m.offset === offset && m.score !== null),
    );
    const scoreOf = mean(here.map((m) => m.score!));
    points.push({
      offset,
      score: roundOrNull(scoreOf),
      comparison_score: roundOrNull(
        mean(
          here
            .map((m) => m.comparison_score)
            .filter((v): v is number => v !== null),
        ),
      ),
      findings_per_session: roundOrNull(
        ratio(
          here.reduce((n, m) => n + m.findings, 0),
          here.reduce((n, m) => n + m.sessions, 0),
        ),
      ),
      comparison_findings_per_session: roundOrNull(
        mean(
          here
            .map((m) => m.comparison_fps)
            .filter((v): v is number => v !== null),
        ),
      ),
    });
  }
  return points;
}

export async function getEfekReport(
  supabase: SupabaseClient,
  query: EfekReportQuery,
): Promise<EfekReport> {
  const [programs, built] = await Promise.all([
    listEfekPrograms(supabase),
    build(supabase, query),
  ]);
  return {
    ...header(built),
    programs: programs.map((p) =>
      summarize(
        p,
        built.results.filter((r) => r.program_code === p.code),
      ),
    ),
    sessions: sessionSummaries(built),
  };
}

export async function getEfekProgramReport(
  supabase: SupabaseClient,
  code: string,
  query: EfekReportQuery,
): Promise<EfekProgramReport> {
  const programs = await listEfekPrograms(supabase);
  const program = programs.find((p) => p.code === code);
  if (!program)
    throw new TnaServiceError(
      "EFEK_PROGRAM_NOT_FOUND",
      404,
      "Program pelatihan tidak ditemukan.",
    );
  const built = await build(supabase, query, code);
  return {
    ...header(built),
    program: summarize(program, built.results),
    sessions: sessionSummaries(built),
    chart: chart(built),
    participants: built.results
      .sort(
        (a, b) =>
          a.nama.localeCompare(b.nama, "id") ||
          b.start_date.localeCompare(a.start_date),
      )
      .map(publicResult),
  };
}
