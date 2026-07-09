import { z } from "zod";

export const serviceTypeSchema = z.enum([
  "call",
  "chat",
  "email",
  "cso",
  "pencatatan",
  "bko",
  "slik",
]);
export type ServiceType = z.infer<typeof serviceTypeSchema>;
export const VALID_SERVICE_TYPES: ServiceType[] = serviceTypeSchema.options;

export const categorySchema = z.enum(["critical", "non_critical", "none"]);
export type Category = z.infer<typeof categorySchema>;

export const scoringModeSchema = z.enum(["weighted", "flat", "no_category"]);
export type ScoringMode = z.infer<typeof scoringModeSchema>;

export const qaPeriodSchema = z.object({
  id: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  label: z.string().optional(),
  created_at: z.string().optional(),
});
export type QAPeriod = z.infer<typeof qaPeriodSchema>;

export const qaIndicatorSchema = z.object({
  id: z.string().uuid(),
  service_type: serviceTypeSchema,
  name: z.string(),
  category: categorySchema,
  bobot: z.number(),
  has_na: z.boolean(),
  threshold: z.number().nullable().optional(),
  created_at: z.string().optional(),
});
export type QAIndicator = z.infer<typeof qaIndicatorSchema>;

export const qaTemuanSchema = z.object({
  id: z.string().uuid(),
  peserta_id: z.string().uuid(),
  period_id: z.string().uuid(),
  indicator_id: z.string().uuid(),
  rule_version_id: z.string().uuid().nullable().optional(),
  rule_indicator_id: z.string().uuid().nullable().optional(),
  service_type: serviceTypeSchema,
  no_tiket: z.string().nullable().optional(),
  is_phantom_padding: z.boolean().optional(),
  phantom_batch_id: z.string().nullable().optional(),
  nilai: z.number().int().min(0).max(3),
  ketidaksesuaian: z.string().nullable().optional(),
  sebaiknya: z.string().nullable().optional(),
  tahun: z.number().int().optional(),
  created_at: z.string().optional(),
  qa_indicators: qaIndicatorSchema.partial().optional(),
  qa_periods: qaPeriodSchema.partial().optional(),
});
export type QATemuan = z.infer<typeof qaTemuanSchema>;

export const createTemuanBatchSchema = z.object({
  peserta_id: z.string().uuid(),
  period_id: z.string().uuid(),
  service_type: serviceTypeSchema,
  no_tiket: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        indicator_id: z.string().uuid(),
        nilai: z.number().int().min(0).max(3),
        ketidaksesuaian: z.string().nullable().optional(),
        sebaiknya: z.string().nullable().optional(),
        no_tiket: z.string().nullable().optional(),
      }),
    )
    .min(1),
});
export type CreateTemuanBatch = z.infer<typeof createTemuanBatchSchema>;

export const serviceWeightSchema = z.object({
  service_type: serviceTypeSchema,
  critical_weight: z.number(),
  non_critical_weight: z.number(),
  scoring_mode: scoringModeSchema,
});
export type ServiceWeight = z.infer<typeof serviceWeightSchema>;

export const ruleVersionStatusSchema = z.enum([
  "draft",
  "published",
  "superseded",
]);
export type RuleVersionStatus = z.infer<typeof ruleVersionStatusSchema>;

export const ruleVersionSchema = z.object({
  id: z.string().uuid(),
  service_type: serviceTypeSchema,
  effective_period_id: z.string().uuid(),
  status: ruleVersionStatusSchema,
  critical_weight: z.number(),
  non_critical_weight: z.number(),
  scoring_mode: scoringModeSchema,
  version_number: z.number().int(),
  indicator_count: z.number().int().optional(),
  change_reason: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_by_user: z.object({ full_name: z.string() }).nullable().optional(),
  published_by: z.string().uuid().nullable().optional(),
  published_by_user: z.object({ full_name: z.string() }).nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
  superseded_by: z.string().uuid().nullable().optional(),
  superseded_at: z.string().datetime().nullable().optional(),
  superseded_by_version_id: z.string().uuid().nullable().optional(),
  created_from_version_id: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().nullable().optional(),
  qa_periods: z
    .object({
      id: z.string().uuid(),
      month: z.number(),
      year: z.number(),
    })
    .nullable()
    .optional(),
});
export type RuleVersion = z.infer<typeof ruleVersionSchema>;

export const ruleIndicatorSchema = z.object({
  id: z.string().uuid(),
  rule_version_id: z.string().uuid(),
  service_type: serviceTypeSchema,
  name: z.string(),
  category: categorySchema,
  bobot: z.number(),
  has_na: z.boolean(),
  threshold: z.number().nullable().optional(),
  sort_order: z.number().int().optional().default(0),
  legacy_indicator_id: z.string().uuid().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().optional(),
});
export type QARuleIndicator = z.infer<typeof ruleIndicatorSchema>;

export const createRuleVersionSchema = z.object({
  service_type: serviceTypeSchema,
  effective_period_id: z.string().uuid(),
  critical_weight: z.number().min(0).max(1).default(0.5),
  non_critical_weight: z.number().min(0).max(1).default(0.5),
  scoring_mode: scoringModeSchema.default("weighted"),
  change_reason: z.string().optional(),
});
export type CreateRuleVersion = z.infer<typeof createRuleVersionSchema>;

export interface ScoreDetail {
  indicatorId: string;
  name: string;
  bobot: number;
  nilai: number;
  temuanCount: number;
  isNa: boolean;
  contribution: number;
  selectedForScoring: boolean;
}

export interface QAScore {
  finalScore: number;
  nonCriticalScore: number;
  criticalScore: number;
  nonCriticalDetail: ScoreDetail[];
  criticalDetail: ScoreDetail[];
  sessionCount: number;
  sessionScores: number[];
}

export interface DashboardSummary {
  totalDefects: number;
  avgDefectsPerAudit: number;
  zeroErrorRate: number;
  avgAgentScore: number;
  complianceRate: number;
  complianceCount: number;
  totalAgents: number;
}

export interface AgentDirectoryEntry {
  id: string;
  nama: string;
  tim: string;
  batch: string;
  batch_name?: string;
  foto_url?: string | null;
  jabatan?: string | null;
  avgScore: number | null;
  trend: "up" | "down" | "same" | "none";
  trendValue: number | null;
  atRisk: boolean;
  periodMonth?: number | null;
}

export interface AgentDirectoryResponse {
  agents: AgentDirectoryEntry[];
  batches: string[];
}

export interface AgentPeriodSummary {
  id: string;
  month: number;
  year: number;
  label: string;
  serviceType: ServiceType;
  finalScore: number;
  nonCriticalScore: number;
  criticalScore: number;
  sessionCount: number;
  findingsCount: number;
}

export interface TopAgentData {
  agentId: string;
  nama: string;
  batch: string;
  tim?: string;
  jabatan?: string;
  defects: number;
  score: number;
  hasCritical: boolean;
  rankChange?: number | null;
}

export interface ParetoData {
  name: string;
  fullName: string;
  count: number;
  cumulative: number;
  category: "critical" | "non_critical";
}

export interface DashboardSparklinePoint {
  label: string;
  value: number;
  count?: number;
  totalAudited?: number;
}

export interface DashboardData {
  periods: QAPeriod[];
  folders: { id: string; name: string; parent_id?: string | null }[];
  summary: DashboardSummary | null;
  serviceData: {
    name: string;
    serviceType: string;
    total: number;
    severity: string;
  }[];
  topAgents: TopAgentData[];
  paretoData: ParetoData[];
  donutData: { critical: number; nonCritical: number; total: number } | null;
  paramTrend: {
    labels: string[];
    datasets: { label: string; data: number[]; isTotal: boolean }[];
  };
  periodMetrics: Array<{
    periodId: string;
    label: string;
    total: number;
    avg: number;
    zero: number;
    compliance: number;
    complianceRate: number;
    avgAgentScore: number;
    totalAudited: number;
  }>;
  sparklines: Record<string, DashboardSparklinePoint[]>;
  availableYears: number[];
  currentYear: number;
  availableServices: ServiceType[];
}

export interface SidakForecastPoint {
  label: string;
  date: string;
  value: number;
}

export interface SidakForecastHistoricalPoint extends SidakForecastPoint {
  periodId: string;
}

export interface SidakForecastSummary {
  direction: "up" | "down" | "stable";
  projectedChange: number;
  projectedChangePercent: number | null;
  confidence: "low" | "medium" | "high";
  method: "linear-regression";
  sourcePointCount: number;
}

export interface SidakForecastSeries {
  scope: {
    type: "total" | "parameter";
    parameterId?: string;
    label: string;
  };
  historical: SidakForecastHistoricalPoint[];
  forecast: SidakForecastPoint[];
  summary: SidakForecastSummary;
  status: "ready";
}

export interface SidakBatchForecastSnapshot {
  series: {
    total: SidakForecastSeries;
    parameters: Record<string, SidakForecastSeries>;
  };
  insight: {
    text: string | null;
    status: "generated" | "unavailable";
  };
  cache: {
    status: "hit" | "generated" | "refreshed";
    filterKey: string;
    dataFingerprint: string;
  };
  generatedAt: string;
}

export type SidakForecastLookupStatus = "missing" | "fresh" | "stale";

export interface SidakForecastLookupResult {
  status: SidakForecastLookupStatus;
  snapshot: SidakBatchForecastSnapshot | null;
}

export interface SidakAgentForecastRequest {
  year?: number;
  serviceType?: ServiceType;
  folderIds?: string[];
  startMonth?: number;
  endMonth?: number;
  horizonMonths?: number;
}

export interface SidakAgentForecastHistoricalPoint {
  periodId: string;
  label: string;
  date: string;
  score: number;
  findingsCount: number;
  criticalFindingsCount: number;
}

export interface SidakAgentForecastEntry {
  agentId: string;
  nama: string;
  tim: string;
  batchName: string;
  jabatan: string | null;
  foto_url: string | null;
  latestPeriodLabel: string;
  latestScore: number;
  latestFindingsCount: number;
  latestCriticalFindingsCount: number;
  projectedScore: number;
  projectedScoreChange: number;
  projectedFindings: number;
  projectedFindingsChange: number;
  findingsSlope: number;
  projectedCriticalFindings: number;
  projectedCriticalFindingsChange: number;
  sourcePointCount: number;
  forecastStatus: "improving" | "declining" | "stable" | "insufficient_data";
  confidence: "low" | "medium" | "high";
  historical: SidakAgentForecastHistoricalPoint[];
}

export interface SidakAgentForecastSummary {
  totalEligible: number;
  improvingCount: number;
  decliningCount: number;
  stableCount: number;
  watchlistCount: number;
  latestPeriodLabel: string;
}

export interface SidakAgentForecastResponse {
  improvingAgents: SidakAgentForecastEntry[];
  decliningAgents: SidakAgentForecastEntry[];
  stableAgents: SidakAgentForecastEntry[];
  watchlistAgents: SidakAgentForecastEntry[];
  summary: SidakAgentForecastSummary;
}

export type RootCauseClusterId =
  | "salah_nama_perusahaan_produk"
  | "kelebihan_standar_jawaban"
  | "salah_jawaban"
  | "kurang_teliti_verifikasi_data"
  | "kurang_paham_standar_jawaban"
  | "kurang_menggali"
  | "salah_penggunaan_sistem"
  | "lainnya";

export interface RootCauseEvidence {
  id: string;
  no_tiket: string | null;
  periodId: string | null;
  indicatorName: string;
  nilai: number;
  text: string;
}

export interface RootCausePeriodBreakdown {
  periodId: string;
  month: number;
  year: number;
  label: string;
  serviceType: ServiceType;
  findingsCount: number;
  criticalFindingsCount: number;
  affectedTickets: number;
}

export interface RootCauseResult {
  clusterId: RootCauseClusterId;
  label: string;
  priority: number;
  findingsCount: number;
  affectedTickets: number;
  criticalFindingsCount: number;
  averageNilai: number;
  matchedKeywords: string[];
  recommendation: string;
  evidence: RootCauseEvidence[];
  periods: RootCausePeriodBreakdown[];
}

export interface AgentDetailData {
  indicators: QAIndicator[];
  periodSummaries: AgentPeriodSummary[];
  selectedPeriod?: AgentPeriodSummary | null;
  temuan: QATemuan[];
  weights: Record<ServiceType, ServiceWeight>;
  personalTrend: {
    labels: string[];
    datasets: { label: string; data: number[]; isTotal: boolean }[];
  };
  availableYears: number[];
  scoreHistory: {
    month: number;
    year: number;
    finalScore: number;
    nonCriticalScore: number;
    criticalScore: number;
    sessionCount: number;
    service_type: ServiceType;
  }[];
  rootCauses: RootCauseResult[];
  initialYear: number;
  initialService: ServiceType;
  initialTrendRange: { start: number; end: number };
  peserta: {
    id: string;
    nama: string;
    tim: string;
    batch_name: string;
    jabatan: string | null;
    foto_url: string | null;
    bergabung_date: string | null;
  };
}

export const resolvedSidakInputConfigSchema = z.object({
  indicators: z.array(
    z.object({
      id: z.string().uuid(),
      service_type: serviceTypeSchema,
      name: z.string(),
      category: categorySchema,
      bobot: z.number(),
      has_na: z.boolean(),
      threshold: z.number().nullable().optional(),
      ruleIndicatorId: z.string().uuid().nullable().optional(),
      legacyIndicatorId: z.string().uuid().nullable().optional(),
    }),
  ),
  weight: z.object({
    service_type: serviceTypeSchema,
    critical_weight: z.number(),
    non_critical_weight: z.number(),
    scoring_mode: scoringModeSchema,
  }),
  ruleVersionId: z.string().uuid().nullable(),
  hasDraftVersion: z.boolean(),
});

export type ResolvedSidakInputConfig = z.infer<
  typeof resolvedSidakInputConfigSchema
>;
