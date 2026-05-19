import { z } from 'zod';

// ── Auth Types ──────────────────────────────────────────
export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'trainer' | 'leader' | 'agent';
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: any } };

// ── SIDAK Types ─────────────────────────────────────────
export const serviceTypeSchema = z.enum(['call', 'chat', 'email', 'cso', 'pencatatan', 'bko', 'slik']);
export type ServiceType = z.infer<typeof serviceTypeSchema>;
export const VALID_SERVICE_TYPES: ServiceType[] = serviceTypeSchema.options;

export const categorySchema = z.enum(['critical', 'non_critical', 'none']);
export type Category = z.infer<typeof categorySchema>;

export const scoringModeSchema = z.enum(['weighted', 'flat', 'no_category']);
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
  items: z.array(z.object({
    indicator_id: z.string().uuid(),
    nilai: z.number().int().min(0).max(3),
    ketidaksesuaian: z.string().nullable().optional(),
    sebaiknya: z.string().nullable().optional(),
  })).min(1),
});
export type CreateTemuanBatch = z.infer<typeof createTemuanBatchSchema>;

export const serviceWeightSchema = z.object({
  service_type: serviceTypeSchema,
  critical_weight: z.number(),
  non_critical_weight: z.number(),
  scoring_mode: scoringModeSchema,
});
export type ServiceWeight = z.infer<typeof serviceWeightSchema>;

// ── Scoring Types ───────────────────────────────────────
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
  trend: 'up' | 'down' | 'same' | 'none';
  trendValue: number | null;
  atRisk: boolean;
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
}

export interface ParetoData {
  name: string;
  fullName: string;
  count: number;
  cumulative: number;
  category: 'critical' | 'non_critical';
}

export interface DashboardData {
  periods: QAPeriod[];
  folders: { id: string; name: string }[];
  summary: DashboardSummary | null;
  serviceData: { name: string; serviceType: string; total: number; severity: string }[];
  topAgents: TopAgentData[];
  paretoData: ParetoData[];
  donutData: { critical: number; nonCritical: number; total: number } | null;
  paramTrend: { labels: string[]; datasets: { label: string; data: number[]; isTotal: boolean }[] };
  sparklines: Record<string, { label: string; value: number }[]>;
  availableYears: number[];
  currentYear: number;
}

export interface AgentDetailData {
  indicators: QAIndicator[];
  periodSummaries: AgentPeriodSummary[];
  selectedPeriod?: AgentPeriodSummary | null;
  temuan: QATemuan[];
  personalTrend: { labels: string[]; datasets: { label: string; data: number[]; isTotal: boolean }[] };
  availableYears?: number[];
  scoreHistory?: { month: number; year: number; finalScore: number; nonCriticalScore: number; criticalScore: number; sessionCount: number; service_type: ServiceType }[];
  initialYear: number;
  initialService: ServiceType;
  initialTrendRange: { start: number; end: number };
}

// ── KETIK Types ────────────────────────────────────────
export type ChatSender = 'agent' | 'consumer' | 'system';

export interface PacingMeta {
  mode: 'realistic' | 'training_fast';
  band: 'short' | 'normal' | 'long' | 'slow' | 'follow_up' | 'greeting_reply';
  plannedDelayMs: number;
  timerClamped: boolean;
}



export interface KetikConsumerType {
  id: string;
  name: string;
  description: string;
  difficulty: 'Mudah' | 'Sedang' | 'Sulit';
  isCustom?: boolean;
}

export interface KetikScenario {
  id: string;
  category: string;
  title: string;
  description: string;
  isActive: boolean;
  script?: string;
  images?: string[];
}

export interface KetikSessionConfig {
  scenarios: KetikScenario[];
  consumerType: KetikConsumerType;
  identity: KetikIdentity;
  selectedModel: string;
  simulationDuration: number;
  responsePacingMode: 'realistic' | 'training_fast';
}

export interface ChatSession {
  id: string;
  date: string;
  scenarioTitle: string;
  consumerName: string;
  consumerPhone?: string;
  consumerCity?: string;
  messages: ChatMessage[];
  finalScore?: number;
  empathyScore?: number;
  probingScore?: number;
  typoScore?: number;
  complianceScore?: number;
  reviewStatus?: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface KetikSessionReview {
  id: string;
  sessionId: string;
  aiSummary: string;
  strengths: string[];
  weaknesses: string[];
  coachingFocus: string[];
  createdAt: string;
}

export interface KetikTypoFinding {
  id: string;
  sessionId: string;
  messageId: string;
  originalWord: string;
  correctedWord: string;
  severity: string;
}

// ── PDKT Types ────────────────────────────────────────
export type WritingStyleMode = 'realistic' | 'training';

export type ConsumerNameMentionPattern = 'random' | 'upfront' | 'middle' | 'late' | 'none';

export type ResolvedConsumerNameMentionPattern = 'upfront' | 'middle' | 'late' | 'none';

export interface PdktConsumerType {
  id: string;
  name: string;
  description: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  tone?: string;
  isCustom?: boolean;
}

export interface PdktScenario {
  id: string;
  category: string;
  title: string;
  description: string;
  isActive: boolean;
  script?: string;
  sampleEmailTemplate?: { subject?: string; body: string };
  alwaysUseSampleEmail?: boolean;
  isLicensed?: boolean;
  attachmentImages?: string[];
}

export interface PdktSessionConfig {
  scenarios: PdktScenario[];
  consumerType: PdktConsumerType;
  identity: PdktIdentity;
  selectedModel: string;
  resolvedConsumerNameMentionPattern: ResolvedConsumerNameMentionPattern;
  writingStyleMode: WritingStyleMode;
}

export interface PdktEvaluationResult {
  score: number;
  feedback: string;
  typos: string[];
  clarityIssues: string[];
  contentGaps: string[];
}

export type MailboxStatus = 'open' | 'replied' | 'deleted';

export interface PdktMailboxItem {
  id: string;
  user_id: string;
  status: MailboxStatus;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  replied_at?: string | null;
  sender_name: string;
  sender_email: string;
  subject: string;
  snippet: string;
  scenario_snapshot: PdktScenario;
  config_snapshot: PdktSessionConfig;
  inbound_email: EmailMessage;
  emails_thread: EmailMessage[];
  history_id?: string | null;
  last_activity_at: string;
}

export interface PdktSessionHistory {
  id: string;
  timestamp: string;
  config: PdktSessionConfig;
  emails: EmailMessage[];
  evaluation: PdktEvaluationResult | null;
  evaluationStatus: 'pending' | 'processing' | 'completed' | 'failed';
  evaluationError?: string | null;
  evaluationStartedAt?: string | null;
  evaluationCompletedAt?: string | null;
  timeTaken: number | null;
}

// ── AI Types ───────────────────────────────────────────
export type AIModule = 'ketik' | 'pdkt' | 'telefun' | 'qa-analyzer';
export type AIProvider = 'gemini' | 'openrouter';

export interface AiModelInfo {
  id: string;
  name: string;
  description: string;
  provider: AIProvider;
}

export interface AiUsageLog {
  id: string;
  request_id: string;
  user_id: string;
  provider: AIProvider;
  model_id: string;
  module: AIModule;
  action: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_price_usd_per_million: number;
  output_price_usd_per_million: number;
  usd_to_idr_rate: number;
  estimated_cost_usd: number;
  estimated_cost_idr: number;
  created_at: string;
}

// ── Zod Validation Schemas ─────────────────────────────
export const chatSenderSchema = z.enum(['agent', 'consumer', 'system']);
export const chatMessageSchema = z.object({
  id: z.string(),
  sender: chatSenderSchema,
  text: z.string(),
  timestamp: z.string(),
  status: z.enum(['sent', 'delivered', 'read']).optional(),
  pacingMeta: z.object({
    mode: z.enum(['realistic', 'training_fast']),
    band: z.enum(['short', 'normal', 'long', 'slow', 'follow_up', 'greeting_reply']),
    plannedDelayMs: z.number(),
    timerClamped: z.boolean(),
  }).optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const ketikIdentitySchema = z.object({
  name: z.string(),
  city: z.string(),
  phone: z.string(),
  signatureName: z.string().optional(),
  gender: z.enum(['male', 'female']).optional(),
  voiceName: z.string().optional(),
});
export type KetikIdentity = z.infer<typeof ketikIdentitySchema>;

export const generateMessageSchema = z.object({
  scenarioId: z.string(),
  consumerTypeId: z.string(),
  identity: z.object({ name: z.string(), city: z.string(), phone: z.string() }),
  selectedModel: z.string().default('gemini-3.1-flash-lite'),
  simulationDuration: z.number().default(5),
  responsePacingMode: z.enum(['realistic', 'training_fast']).default('realistic'),
  chatHistory: z.array(chatMessageSchema),
});

export const pdktIdentitySchema = z.object({
  name: z.string(),
  email: z.string(),
  city: z.string(),
  bodyName: z.string(),
});
export type PdktIdentity = z.infer<typeof pdktIdentitySchema>;

export const generateEmailSchema = z.object({
  scenarioId: z.string(),
  consumerTypeId: z.string(),
  identity: pdktIdentitySchema,
});

export const emailMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  timestamp: z.string(),
  isAgent: z.boolean(),
  attachments: z.array(z.string()).optional(),
});
export type EmailMessage = z.infer<typeof emailMessageSchema>;

export const evaluateSchema = z.object({
  config: z.object({
    scenarios: z.array(z.any()),
    consumerType: z.any(),
    identity: z.any(),
    selectedModel: z.string(),
    resolvedConsumerNameMentionPattern: z.string().default('none'),
    writingStyleMode: z.enum(['realistic', 'training']).default('training'),
  }),
  emails: z.array(emailMessageSchema),
});

// ── Profiler Types ──────────────────────────────────────
export interface ProfilerYear {
  id: string;
  year: number;
  label: string;
  created_at?: string;
}

export interface ProfilerFolder {
  id: string;
  name: string;
  trainer_id?: string | null;
  year_id?: string | null;
  parent_id?: string | null;
  created_at?: string;
}

export interface ProfilerPeserta {
  id: string;
  trainer_id?: string | null;
  batch_name: string;
  nomor_urut: number;
  nama: string;
  tim: string;
  jabatan: string;
  foto_url?: string | null;
  photo_frame?: any;
  nik_ojk?: string | null;
  bergabung_date?: string | null;
  email_ojk?: string | null;
  no_telepon?: string | null;
  no_telepon_darurat?: string | null;
  nama_kontak_darurat?: string | null;
  hubungan_kontak_darurat?: string | null;
  jenis_kelamin?: string | null;
  agama?: string | null;
  tgl_lahir?: string | null;
  status_perkawinan?: string | null;
  pendidikan?: string | null;
  no_ktp?: string | null;
  no_npwp?: string | null;
  nomor_rekening?: string | null;
  nama_bank?: string | null;
  alamat_tinggal?: string | null;
  status_tempat_tinggal?: string | null;
  nama_lembaga?: string | null;
  jurusan?: string | null;
  previous_company?: string | null;
  pengalaman_cc?: string | null;
  catatan_tambahan?: string | null;
  keterangan?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProfilerTim {
  id: string;
  nama: string;
  trainer_id?: string | null;
  created_at?: string;
}
