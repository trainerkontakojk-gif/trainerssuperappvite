import type { Page } from "@playwright/test";
import type {
  TnaMetricsSnapshot,
  TnaParameterDetail,
  TnaNeed,
  TnaPlan,
  TnaPlanDetail,
  TnaProgram,
} from "@trainers/types";
import { openHermeticShell, type ApiMock } from "./hermeticShell";

export const ids = {
  period: "10000000-0000-4000-8000-000000000001",
  indicator: "10000000-0000-4000-8000-000000000002",
  need: "10000000-0000-4000-8000-000000000003",
  plan: "10000000-0000-4000-8000-000000000004",
  program: "10000000-0000-4000-8000-000000000005",
  ana: "10000000-0000-4000-8000-000000000006",
  budi: "10000000-0000-4000-8000-000000000007",
  evaluation: "10000000-0000-4000-8000-000000000008",
  later: "10000000-0000-4000-8000-000000000009",
};
const timestamp = "2026-10-08T10:00:00.000Z";
export const metrics: TnaMetricsSnapshot = {
  metric_version: 1,
  computed_at: timestamp,
  serviceType: "call",
  indicatorId: ids.indicator,
  parameterName: "Ketelitian verifikasi",
  category: "non_critical",
  periodId: ids.period,
  auditedAgents: 10,
  sampledSessions: 50,
  findings: 2,
  affectedAgents: 2,
  ratePer100: 4,
  spreadPct: 20,
  auditStatus: "audited",
  insufficientData: true,
  comparePeriods: [],
  comparisonRatePer100: null,
  trendStatus: "no_comparison_data",
  trendPct: null,
  isCandidate: false,
  signals: [],
  suggestedIntervention: "kelompok_kecil",
};
export const program: TnaProgram = {
  id: ids.program,
  code: "verifikasi",
  name: "Ketelitian dan Verifikasi Data",
  description: "Latihan verifikasi",
  gap_type: "skill",
  trigger_clusters: ["kurang_teliti_verifikasi_data"],
  service_types: [],
  suggested_modules: [],
  is_active: true,
  created_at: timestamp,
};
export const detail: TnaParameterDetail = {
  metrics,
  affected_agents: [
    { peserta_id: ids.ana, nama: "Ana Contoh", tim: "Tim A", findings: 1 },
    { peserta_id: ids.budi, nama: "Budi Contoh", tim: "Tim A", findings: 1 },
  ],
  clusters: [
    {
      clusterId: "kurang_teliti_verifikasi_data",
      label: "Kurang teliti verifikasi data",
      priority: 1,
      findingsCount: 2,
      affectedTickets: 2,
      criticalFindingsCount: 0,
      averageNilai: 1,
      matchedKeywords: [],
      recommendation: "Baca kembali data",
      evidence: [],
      periods: [],
    },
  ],
  sample_tickets: [
    {
      id: ids.indicator,
      peserta_id: ids.ana,
      no_tiket: "TIKET-CONTOH-01",
      ketidaksesuaian: "Data belum diverifikasi",
      sebaiknya: "Verifikasi ulang",
    },
  ],
  suggested_programs: [program],
};
export const need: TnaNeed = {
  id: ids.need,
  service_type: "call",
  period_id: ids.period,
  indicator_id: ids.indicator,
  compare_count: 2,
  validated_cluster_id: "kurang_teliti_verifikasi_data",
  cause_note: "Perlu latihan verifikasi ulang data",
  gap_type: "skill",
  outcome: "training",
  validation_snapshot: metrics,
  suggested_cluster_id: "kurang_teliti_verifikasi_data",
  created_by: ids.ana,
  created_at: timestamp,
};
export const plan: TnaPlan = {
  id: ids.plan,
  need_id: ids.need,
  program_id: ids.program,
  title: "Latihan verifikasi data",
  intervention_type: "kelompok_kecil",
  start_date: "2026-10-10",
  end_date: "2026-10-11",
  evaluation_due_date: "2026-11-11",
  target_max_rate_per_100: 2,
  target_max_spread_pct: 10,
  status: "draft",
  baseline_snapshot: null,
  activated_at: null,
  cancelled_at: null,
  created_by: ids.ana,
  created_at: timestamp,
  updated_at: timestamp,
};
export function planDetail(status: TnaPlan["status"] = "draft"): TnaPlanDetail {
  const baseline = {
    ...metrics,
    validation_drift: { findings: 0, auditedAgents: 0 },
  };
  return {
    plan: {
      ...plan,
      status,
      baseline_snapshot: status === "aktif" ? baseline : null,
    },
    participants: [
      {
        id: ids.ana,
        plan_id: ids.plan,
        peserta_id: ids.ana,
        peserta_name_snapshot: "Ana Contoh",
        team_snapshot: "Tim A",
        baseline_findings: status === "aktif" ? 1 : null,
        was_affected: status === "aktif" ? true : null,
      },
    ],
    preview: status === "draft" ? baseline : null,
    participant_preview:
      status === "draft"
        ? [{ peserta_id: ids.ana, baseline_findings: 1, was_affected: true }]
        : null,
    narrative: `${status === "draft" ? "Pratinjau: " : ""}Tingkat ketidaksesuaian 4 per 100 sesi sampel. Penyebab divalidasi trainer: kurang teliti.`,
  };
}
const ok = (data: unknown) => ({ success: true, data });
export const defaults: ApiMock[] = [
  { method: "GET", path: "/api/v1/me/access-status", body: ok({}) },
  {
    method: "GET",
    path: "/api/v1/sidak/periods",
    body: ok([
      { id: ids.period, month: 10, year: 2026, created_at: timestamp },
    ]),
  },
  {
    method: "GET",
    path: /^\/api\/v1\/tna\/parameters\?/,
    body: ok({
      items: [],
      compare_period_ids: [],
      selected_audit_status: "audited",
      insufficientData: true,
    }),
  },
  { method: "GET", path: "/api/v1/tna/parameters/detail", body: ok(detail) },
  { method: "GET", path: "/api/v1/tna/needs", body: ok({ items: [need] }) },
  {
    method: "GET",
    path: `/api/v1/tna/needs/${ids.need}`,
    body: ok({ need, plans: [] }),
  },
  { method: "POST", path: "/api/v1/tna/needs", status: 201, body: ok(need) },
  { method: "GET", path: "/api/v1/tna/programs", body: ok([program]) },
  { method: "GET", path: "/api/v1/tna/plans", body: ok({ items: [] }) },
  { method: "POST", path: "/api/v1/tna/plans", status: 201, body: ok(plan) },
  {
    method: "GET",
    path: `/api/v1/tna/plans/${ids.plan}`,
    body: ok(planDetail()),
  },
  { method: "PATCH", path: `/api/v1/tna/plans/${ids.plan}`, body: ok(plan) },
  {
    method: "POST",
    path: `/api/v1/tna/plans/${ids.plan}/activate`,
    body: ok({ ...plan, status: "aktif" }),
  },
  {
    method: "POST",
    path: `/api/v1/tna/plans/${ids.plan}/cancel`,
    body: ok({ ...plan, status: "dibatalkan" }),
  },
  {
    method: "GET",
    path: "/api/v1/profiler/peserta/options",
    body: ok([
      { id: ids.budi, nama: "Budi Contoh", tim: "Tim A", batch_name: "Contoh" },
    ]),
  },
];
export function openTna(
  page: Page,
  path = "/tna",
  overrides: ApiMock[] = [],
  role = "trainer",
  waitForUrl?: RegExp,
) {
  return openHermeticShell(page, {
    path,
    apiMocks: [...overrides, ...defaults],
    auth: { role },
    waitForUrl,
  });
}
export function evaluationDetail(
  status: TnaPlan["status"] = "evaluasi",
): TnaPlanDetail {
  const d = planDetail("aktif");
  const cohort = {
    agents: 1,
    findings: 1,
    sampledSessions: 5,
    ratePer100: 20,
    spreadPct: 100,
  };
  const evaluation: NonNullable<TnaPlanDetail["evaluation"]> = {
    metric_version: 1,
    computed_at: timestamp,
    evaluation_period_id: ids.evaluation,
    population: {
      ...metrics,
      periodId: ids.evaluation,
      auditedAgents: 20,
      sampledSessions: 200,
      affectedAgents: 1,
      ratePer100: 1,
      spreadPct: 5,
    },
    baseline_recompute_drift: { findings: 1, auditedAgents: 0 },
    cohorts: {
      participants: {
        baseline: { ...cohort, agents: 2, findings: 2, sampledSessions: 10 },
        evaluation: { ...cohort, findings: 0, ratePer100: 0, spreadPct: 0 },
        delta: -20,
      },
      comparison: {
        baseline: {
          ...cohort,
          agents: 5,
          sampledSessions: 25,
          ratePer100: 4,
          spreadPct: 20,
        },
        evaluation: {
          ...cohort,
          agents: 5,
          sampledSessions: 25,
          ratePer100: 4,
          spreadPct: 20,
        },
        delta: 0,
      },
      comparison_small: false,
      net_effect: -20,
    },
    verdict: "tercapai",
  };
  return {
    ...d,
    plan: {
      ...d.plan,
      status,
      evaluation_due: true,
      evaluation_period_id: status === "aktif" ? null : ids.evaluation,
      evaluation_snapshot: status === "selesai" ? evaluation : null,
      verdict: status === "selesai" ? "tercapai" : null,
      conclusion_note:
        status === "selesai" ? "Hasil evaluasi sudah diperiksa trainer." : null,
      follow_up: status === "selesai" ? "perlu_rencana_lanjutan" : null,
    },
    participants: [
      ...d.participants,
      {
        ...d.participants[0],
        id: ids.budi,
        peserta_id: ids.budi,
        peserta_name_snapshot: "Budi Contoh",
      },
    ],
    evaluation: status === "aktif" ? null : evaluation,
    participant_evaluation:
      status === "aktif"
        ? null
        : [
            {
              participant_id: ids.ana,
              peserta_id: ids.ana,
              baseline_findings: 1,
              baseline_sessions: 5,
              baseline_sessions_source: "frozen",
              eval_findings: 0,
              eval_sessions: 5,
              audited_in_eval: true,
            },
            {
              participant_id: ids.budi,
              peserta_id: ids.budi,
              baseline_findings: 1,
              baseline_sessions: 5,
              baseline_sessions_source: "recomputed",
              eval_findings: null,
              eval_sessions: null,
              audited_in_eval: false,
            },
          ],
    evaluation_period_options:
      status === "selesai"
        ? []
        : [
            {
              id: ids.evaluation,
              month: 11,
              year: 2026,
              auditStatus: "audited",
              is_default: true,
            },
            {
              id: ids.later,
              month: 12,
              year: 2026,
              auditStatus: "no_audit",
              is_default: false,
            },
          ],
    evaluation_narrative:
      status === "aktif"
        ? null
        : `${status === "evaluasi" ? "Pratinjau: " : ""}Evaluasi November 2026: narasi deterministik dari server. Perbandingan ini indikatif, bukan bukti sebab-akibat.`,
  };
}
export const parameterUrl = `/tna/parameter?service=call&period=${ids.period}&indicator=${ids.indicator}&compare=2`;
