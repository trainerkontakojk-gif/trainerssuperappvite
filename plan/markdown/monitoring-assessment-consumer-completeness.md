# Monitoring Assessment & Consumer Completeness

## Requirement

### Goal
Make `/dashboard` Monitoring a faithful, complete served-consumer of the native KETIK, PDKT, and Telefun review contracts. Monitoring must expose complete canonical AI assessment and relevant session/consumer metadata, must not silently lose history rows, and must not invent Telefun metrics.

### Scope
- KETIK: canonical session metadata (`consumerName`, `consumerPhone`, `consumerCity`, `simulationDuration`), complete message history, native score fields, and the existing canonical review/typo detail.
- PDKT: identity, consumer type, recipient/contact context, full evaluation, and full email thread. This scope explicitly excludes mailbox permissions, delete/reply actions, and other unrelated mailbox action state.
- Telefun: canonical parsed voice assessment, canonical communication profile, canonical hold assessment, transcript/recording metadata, and runtime-normalized coaching recommendations from `telefun_coaching_summary`.
- Monitoring history retrieval: complete deterministic offset-range paging with no fixed per-source `200` caps; fail-closed on any source/page/profile/coaching error, and richer canonical Telefun rows win over legacy `results` rows.
- UI: history table/card and detail modal, responsive mobile/desktop behavior, without fabricated Telefun submetrics.

### Canonical sources
| Module | Canonical source | Canonical detail contract |
|---|---|---|
| KETIK | `ketik_history`, `ketik_session_reviews`, `ketik_typo_findings` | `KetikSessionHistoryItem`, `KetikSessionReview`, `KetikTypoFinding` |
| PDKT | `pdkt_history`; session config/evaluation/thread stored on the history row; mailbox metadata only where linked/available | `PdktSessionHistory`, `PdktSessionConfig`, `EmailMessage`, `PdktEvaluationResult`; use `PdktMailboxItem` field meanings only for in-scope metadata |
| Telefun | `telefun_history`, canonical parsers/profile helpers, `telefun_coaching_summary` | `VoiceQualityAssessment`, `TelefunCommunicationProfile`, `TelefunHoldAssessment`, transcript parser, coaching `recommendations` JSON |

### Acceptance criteria
1. Every Monitoring history query reads all eligible rows via complete deterministic offset-range paging for KETIK, PDKT, and both Telefun sources; page/source/profile/coaching failures return explicit 500 rather than a partial array, and no hidden `50`/`200` cap remains on the monitoring path.
2. A Telefun `telefun_history` row and matching legacy `results` row produce one row keyed by the canonical session ID when that relationship is available. Canonical rows win all overlapping fields; if the legacy relation is absent, do not broad-dedupe by signature, and keep any legacy-only row explicitly legacy/incomplete with detail available but assessment/coaching unavailable.
3. Telefun monitoring detail reads `telefun_coaching_summary.recommendations` and normalizes each item at runtime to `{ text: string; priority: number }`. Missing or malformed summary is represented explicitly as unavailable, never as fabricated content.
4. Telefun assessment is accepted only after the canonical `parseVoiceQualityAssessment` boundary. Detail includes all five aspects, `communicationProfile` (five canonical metrics, summary, strengths, priorities), `holdManagement`, transcript, recording state, and session score. Hold remains system-derived and is not inferred by the UI.
5. Telefun list/table displays only source-backed metrics: canonical score and available assessment values (WPM, intonation, articulation, filler count, tone). It removes `getTelefunSubmetrics()` and never derives “Kepatuhan/Empati/Kejelasan/Solusi” from overall score.
6. KETIK Monitoring carries and displays consumer name, phone, city, simulation duration, all messages, and native score fields. Missing `consumer_name` stays null in the API and renders as “Tidak tersedia” in the UI rather than a fabricated placeholder.
7. PDKT Monitoring carries identity, consumer type, recipient/contact context, scenario/config snapshot as applicable, full evaluation (including breakdown, arrays, feedback, evaluation error, status, and timing), and the complete email thread. PDKT JSON payloads are allow-list normalized before rendering, and it does not add permissions or delete/reply action controls to Monitoring.
8. The detail endpoint and client types expose the same fields as the rendered detail panels; no `unknown` assessment is rendered without canonical parsing/normalization at the API boundary.
9. Existing role checks and server-side cross-account access remain unchanged. No direct browser query of sensitive tables is introduced.
10. History table/card and detail modal remain usable on desktop and mobile: horizontal overflow is intentional for dense table content, detail sections stack at narrow widths, long text/threads are scrollable without truncation of stored content, controls remain keyboard accessible, and equal timestamps keep deterministic backend tie-breakers in the rendered order.

### Edge cases
- Empty/malformed/legacy JSON: return safe nullable/empty typed fields and an explicit “not available” state; do not invent score or recommendation values.
- Valid score `0` and Telefun filler count `0` remain valid values, not missing values.
- Telefun assessment missing profile/hold: rebuild/normalize through canonical parser/enrichment; invalid hold becomes `not_used` per contract.
- Coaching summary absent, duplicated, malformed, or present for a deleted/missing session: ignore orphan data, show no recommendations, and do not fail the entire history response.
- Legacy Telefun row has score but no assessment: retain it only when no richer canonical row exists; status may be completed from source score, but assessment remains unavailable.
- Matching Telefun rows have different timestamps/recording paths: match by canonical session ID/foreign relationship first; if the relationship is absent, do not broad-dedupe by signature. Keep the legacy row explicit and leave assessment/coaching unavailable unless canonical data is present.
- Partial source/page/profile/coaching failure: return a fail-closed 500 for the monitoring response, log the source error, and never report a partial array as complete.
- Null profile email/name, null phone/city, no PDKT recipient context, no attachments, and empty threads are valid and rendered as unavailable/empty.
- Long PDKT feedback, arrays, transcript, and recommendations are not sliced in API; UI may use collapsible/scrollable presentation but must provide access to all values.
- Existing dirty Telefun WebRTC work is unrelated and must not be rebased, reformatted, or modified.

## Design

### Data flow
1. `GET /ai/monitoring/history` obtains complete canonical offset-range pages for `ketik_history`, `pdkt_history`, `telefun_history`, and legacy Telefun `results` (if retained for compatibility); any page/source/profile/coaching failure returns 500 instead of a partial array.
2. Backend resolves profiles and, for Telefun, batches `telefun_coaching_summary` by canonical session IDs. It parses/normalizes Telefun assessment using `parseVoiceQualityAssessment`, and normalizes coaching items before serialization; it does not implement a second parser.
3. Backend maps source rows into one shared `UnifiedHistoryEntry`, with module-specific typed payloads. Merge/dedupe happens before sorting; canonical `telefun_history` outranks `results`, and legacy-only rows stay explicitly legacy/incomplete.
4. Detail endpoints return typed, complete module payloads. Telefun detail joins the coaching summary by `session_id` and preserves unavailable states; KETIK and PDKT return their native assessment/thread data.
5. `rpc-client.ts` mirrors the exact response types. Monitoring components render source-backed values and explicit unavailable states.

### Exact shared fields/types
```ts
type ReviewStatus = "not_started" | "pending" | "processing" | "completed" | "failed";
type MonitoringModule = "ketik" | "pdkt" | "telefun";

type UnifiedHistoryEntry = {
  id: string;
  user_id: string;
  module: MonitoringModule;
  scenario_title: string;
  created_at: string;
  duration_seconds: number;
  score: number | null;
  history: unknown;
  user_email?: string;
  user_role?: string;
  review_status: ReviewStatus;
  scores?: { final?: number; empathy?: number; probing?: number; resolution?: number; typo?: number; compliance?: number };
  ketik_session?: {
    consumer_name: string;
    consumer_phone: string | null;
    consumer_city: string | null;
    simulation_duration: number | null;
    messages: ChatMessage[];
  };
  pdkt_session?: {
    identity: PdktIdentity | null;
    consumer_type: PdktConsumerType | null;
    recipient_context: PdktRecipientContext | null;
    scenario_snapshot: PdktScenario | null;
    config_snapshot: PdktSessionConfig | null;
    emails: EmailMessage[];
    evaluation: PdktEvaluationResult | null;
    evaluation_status: ReviewStatus;
    evaluation_error: string | null;
    time_taken: number | null;
    created_at: string;
    updated_at: string | null;
    replied_at: string | null;
    last_activity_at: string | null;
    sender_name: string | null;
    sender_email: string | null;
    subject: string | null;
    attachments: string[];
  };
  telefun_assessment?: VoiceQualityAssessment;
  telefun_coaching?: {
    recommendations: Array<{ text: string; priority: number }>;
    generated_at: string | null;
  };
};
```

Notes: use the actual shared type names/exports in `@trainers/types`; the names above are the contract targets, not permission to duplicate schemas. `history` may remain the transport-compatible raw transcript/thread field, but module payloads are authoritative and complete. PDKT `attachments` must be the in-scope content metadata only; do not expose `permissions` or action handlers.

### Detail response contracts
- **KETIK**: existing `KetikMonitoringReview` plus `session: { consumerName: string | null; consumerPhone: string | null; consumerCity: string | null; simulationDuration: number | null; messages: ChatMessage[] }`; existing scores/review/typos remain intact.
- **PDKT**: `{ module: "pdkt"; review_status: ReviewStatus; session: { identity: PdktIdentity | null; consumer_type: PdktConsumerType | null; recipient_context: PdktRecipientContext | null; scenario_snapshot: PdktScenario | null; config_snapshot: PdktSessionConfig | null; emails: EmailMessage[]; attachments: string[]; created_at: string; updated_at: string | null; replied_at: string | null; last_activity_at: string | null; sender_name: string | null; sender_email: string | null; subject: string | null }; evaluation: PdktEvaluationResult | null; evaluation_error: string | null; time_taken: number | null }`. No `permissions`, `can_delete`, `can_reply`, or mailbox mutation data.
- **Telefun**: `{ module: "telefun"; review_status: ReviewStatus; score: number | null; recording_path: string | null; agent_recording_path: string | null; recording_url: string | null; scenario_title: string | null; duration_seconds: number | null; voice_assessment: VoiceQualityAssessment | null; transcript: ParsedTelefunTranscript[]; ai_summary: string | null; strengths: string[]; weaknesses: string[]; coaching_focus: string[]; coaching_recommendations: Array<{ text: string; priority: number }>; coaching_generated_at: string | null }`. Legacy summary fields remain compatibility-only; recommendation source is `telefun_coaching_summary`, and recording URLs are signed only from safe owned storage paths.

### Merge and completeness strategy
- Prefer a database relationship/ID match for Telefun; otherwise use no broad fallback signature that can merge unrelated sessions. Canonical rows win first, and any legacy-only row stays explicit.
- Replace fixed limits with deterministic offset-range paging ordered by `(created_at/date, id)` with explicit page traversal until the source is exhausted. The API must not silently return a partial list. Preserve deterministic descending order with equal timestamps resolved by the id tie-breaker.
- Batch coaching-summary reads by canonical Telefun IDs and map by `session_id`; runtime-normalize each recommendation item before render.
- Keep source-specific errors observable. A failed page/source/profile/coaching read must return 500 rather than a partial payload.
- Do not touch schema/migrations: this is a read/contract/UI change using existing tables and RPCs.

### Component behavior
**Desktop**
- Keep the monitoring table, but replace fabricated Telefun columns with canonical source metrics and a clear “assessment unavailable” state.
- Preserve full content behind detail; use expandable sections for long PDKT evaluation/thread, Telefun profile metrics, hold, transcript, and recommendations.
- Show relevant KETIK consumer metadata and PDKT identity/consumer/recipient/contact metadata near the detail header, not permissions/actions.

**Mobile**
- Cards/table rows show module, scenario, user, time/duration, canonical score, and only available source metrics; no synthetic values.
- Dense table may scroll horizontally; modal body stacks sections and uses bounded scroll containers for threads/transcripts.
- Long feedback/recommendations are expandable rather than line-clamped away. Dialog close, expand/collapse, audio, and links remain keyboard accessible.
- Use existing CSS variables/design tokens from `docs/design.md`; do not add decorative badges, hardcoded palette values, or unrelated visual redesign.

### Files intentionally excluded
All dirty/untracked Telefun WebRTC files, tests, routes, docs, and plans shown by `git status` are unrelated. In particular, do not modify `apps/telefun/**`, `apps/web/src/routes/telefun/**`, Telefun capability/WebRTC files, or the dirty `docs/telefun*` files except the monitoring panel named in the task. Do not modify migrations or generated `graphify-out/**`.

## Tasklist

### RED — tests first
- [x] Extend/create `apps/api/src/__tests__/monitoring-history-service.test.ts`: >200 rows per source are all returned; deterministic offset-range traversal is complete; canonical Telefun row wins over matching legacy row; no broad-signature collision; KETIK/PDKT fields are preserved; partial source failure is observable.
- [x] Extend/create `apps/api/src/__tests__/monitoring-history-enrichment.test.ts`: canonical Telefun parser/profile/hold normalization, no truncation, explicit missing coaching state, and summary join by `session_id`.
- [x] Extend/create `apps/api/src/__tests__/telefun-monitoring-review-transcript.test.ts`: seeded `telefun_coaching_summary.recommendations` and `generated_at` are returned; transcript/recording remain present; legacy summary columns cannot override richer canonical data.
- [x] Add/extend API contract tests for KETIK and PDKT detail fields (exact metadata, full evaluation/thread, no permissions/actions).
- [x] Extend `apps/web/src/__tests__/monitoring-redesign.test.tsx`: KETIK consumer metadata, PDKT identity/consumer type/recipient/contact/attachments/full evaluation/thread, canonical Telefun profile/hold/recommendations, and no fabricated Telefun labels/values.
- [x] Extend `apps/web/src/__tests__/monitoring-telefun-recording-url.test.tsx`: canonical hold/profile/recommendations render and unavailable-state behavior.

### GREEN — implementation order
1. `apps/api/src/services/monitoring-history-service.ts`: widen typed contracts, complete retrieval/pagination, canonical merge, preserve full module fields, batch coaching summary, parse/enrich Telefun assessment.
2. `apps/api/src/routes/ai.ts`: expand KETIK/PDKT/Telefun review responses; join `telefun_coaching_summary`; preserve auth and recording signing; return typed unavailable states.
3. `apps/web/src/lib/api/rpc-client.ts`: mirror exact API types using shared canonical types; remove `unknown` where the response is canonical.
4. `apps/web/src/routes/monitoring/utils/formatting.tsx`: align shared type and remove `getTelefunSubmetrics`/fabricated scenario copy where it implies source metrics.
5. `apps/web/src/routes/monitoring/components/HistoryCard.tsx` and `HistoryTab.tsx`: render canonical source fields, remove fabricated Telefun submetrics, avoid silent line-clamp loss, retain pagination over the complete server result.
6. `apps/web/src/routes/monitoring/components/ReviewDetailModal.tsx`: render metadata summary and responsive structure.
7. `apps/web/src/routes/monitoring/components/KetikReviewPanel.tsx`, `PdktEvaluationPanel.tsx`, and `TelefunReviewPanel.tsx`: render complete canonical detail, PDKT in-scope metadata/thread/evaluation, Telefun profile/hold/coaching recommendations; do not add mailbox actions.

### REFACTOR and verification
- [x] Run focused API tests: `pnpm --filter @trainers/api vitest run src/__tests__/monitoring-history-service.test.ts src/__tests__/monitoring-history-enrichment.test.ts src/__tests__/telefun-monitoring-review-transcript.test.ts` plus new KETIK/PDKT contract tests.
- [x] Run focused web tests: `pnpm --filter @trainers/web vitest run src/__tests__/monitoring-redesign.test.tsx src/__tests__/monitoring-telefun-recording-url.test.tsx`.
- [x] Run `pnpm lint`, `pnpm build`, and `pnpm test:core` for this behavior/API/UI change; inspect `git diff --check` and confirm no unrelated dirty files changed.
- [x] Load/run `thermo-nuclear` review after implementation and `impeccable` UI audit before final verification; fix material findings and repeat the relevant checks.
- [x] Update canonical monitoring documentation before merge if the public response contract changes; do not update unrelated Telefun WebRTC docs.

### Estimates and dependencies
- Backend contract/retrieval/merge: 1.5–2 days; UI/types: 1–1.5 days; focused tests and responsive audit: 0.5–1 day.
- Dependencies: existing Supabase tables, existing canonical `@trainers/types` parsers/profile helpers, current Hono RPC client, existing monitoring auth.

### Risk register
| Risk | Mitigation |
|---|---|
| Pagination still misses rows or creates inconsistent snapshots | Use deterministic offset-range traversal with ordered page retrieval, test >200 rows, and expose page/source errors. |
| Legacy dedupe hides a canonical session | Match by canonical ID first; canonical row precedence test with richer assessment. |
| Malformed historical JSON breaks the list | Parse at boundary, return typed null/empty state, log diagnostics. |
| PDKT contract accidentally leaks mailbox controls | Type review response with an allow-list and tests asserting absent permission/action fields. |
| Telefun UI diverges from native formulas | Reuse canonical parser/profile components and `HoldAssessmentCard`; never calculate score-derived metrics. |
| Large full threads affect rendering | Server returns complete data; UI uses bounded scroll/expand, not data truncation. |
| Dirty WebRTC work is accidentally included | Restrict implementation files to the listed monitoring/API/type files and review diff path list. |

### Rollback plan
Revert only the monitoring service/route/client/type/component/test changes from this plan. Restore the prior monitoring response mapping and UI rendering; leave all existing database rows, migrations, Telefun WebRTC work, and unrelated working-tree changes untouched. No migration rollback is required.

## Selected assumptions and unresolved conflicts

- **Resolved:** `telefun_history.id` is the canonical session identity and `telefun_coaching_summary.session_id` is the authoritative join. If a legacy relation is absent, do not broad-dedupe by signature; keep any legacy-only row explicit/legacy and leave canonical assessment/coaching unavailable unless a canonical row exists.
- **Resolved:** Existing shared types (`PdktIdentity`, `PdktConsumerType`, `PdktRecipientContext`, `PdktScenario`, `PdktSessionConfig`, `EmailMessage`, `PdktEvaluationResult`) are the source of truth; no parallel monitoring-only schema should be invented.
- **Resolved:** Coaching recommendation priority is numeric `1..5`, based on the existing JSON/RPC contract; preserve it as a number.
- **Resolved:** `docs/MONITORING_TOKEN_USAGE_BILLING.md` and `docs/modules.md` follow the current RPC client and runtime-normalized monitoring contract; they do not describe legacy `getApi`/`putApi` helpers.
- **Resolved:** The remaining Telefun/KETIK monitoring work stays within the existing monitoring/API/UI surfaces and does not require unrelated Telefun WebRTC changes.
- **Resolved:** Canonical Telefun rows always win, legacy-only rows stay explicit, and Monitoring treats partial source/page/profile/coaching failures as explicit 500s rather than partial success.
