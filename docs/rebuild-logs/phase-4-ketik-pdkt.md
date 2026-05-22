# Phase 4 — KETIK & PDKT (AI Training Modules)

## Goal

Implement AI-powered training modules (KETIK chat simulation & PDKT email simulation) with Gemini/OpenRouter integration, usage logging, and frontend UI.

## What was built

### Database Migration

- `supabase/migrations/002_ketik_pdkt_core.sql`
  - `ai_pricing_settings`, `ai_billing_settings`, `ai_usage_logs` — usage tracking
  - `ketik_history`, `ketik_session_reviews`, `ketik_typo_findings`, `ketik_review_jobs` — KETIK persistence
  - `pdkt_history`, `pdkt_mailbox_items` — PDKT persistence
  - RLS policies (users see own data, pricing read-only)
  - Seed data: 10 model pricing entries + billing rate 15000 IDR/USD

### Shared Types (`packages/types/src/index.ts`)

- KETIK: `ChatMessage`, `PacingMeta`, `KetikScenario`, `KetikConsumerType`, `ChatSession`, `KetikSessionReview`, `KetikTypoFinding`
- PDKT: `EmailMessage`, `PdktScenario`, `PdktConsumerType`, `PdktIdentity`, `PdktSessionConfig`, `PdktEvaluationResult`, `PdktMailboxItem`, `PdktSessionHistory`
- AI: `AiModelInfo`, `AiUsageLog`, `AIModule`, `AIProvider`

### AI Infrastructure (`apps/api/src/lib/`)

- `ai-models.ts` — model registry (9 models), `resolveModelProvider()`, `normalizeModelId()`, `getModelsForModule()`
- `ai-usage.ts` — `logAiUsage()` with pricing lookup, cost calc, fallback to zero
- `gemini.ts` — `generateGeminiContent()` with system instruction, usage logging, retry on developer instruction error
- `openrouter.ts` — `generateOpenRouterContent()` with 4-attempt retry on 429, OpenAI-compatible mapping

### Backend Routes

- **KETIK** (`/api/v1/ketik`):
  - `GET /scenarios` — list scenarios
  - `GET /consumer-types` — list consumer types
  - `POST /generate` — generate AI consumer response given chat history
- **PDKT** (`/api/v1/pdkt`):
  - `GET /scenarios`, `GET /consumer-types`
  - `POST /generate-identity` — random dummy profile
  - `POST /generate-template` — AI-generated email template
  - `POST /evaluate` — evaluate agent's email response
- **AI** (`/api/v1/ai`):
  - `GET /models` — list models (filterable by module)
  - `POST /generate` — generic AI generation endpoint
  - `GET /usage` — user's usage logs

### Frontend Pages

- `/ketik` — landing page with scenario grid
- `/ketik/simulation` — chat interface with AI consumer
- `/ketik/history` — empty placeholder for session history
- `/pdkt` — landing page with scenario grid
- `/pdkt/simulation` — email viewer + compose + evaluate
- `/pdkt/history` — empty placeholder for session history
- Nav bar updated: Dashboard, SIDAK, KETIK, PDKT, Settings

### Dependencies Added

- `@google/genai` (Gemini SDK) in `apps/api`

## Key Decisions

- Frontend calls AI endpoints (not direct) to respect server-side usage logging
- `POST /ketik/generate` accepts full chat history and returns consumer's next message
- PDKT evaluation uses Gemini JSON mode with structured schema
- Usage logging uses admin (service_role) client to bypass RLS on `ai_usage_logs`
- No rate limiting yet (to be added in Phase 7 Hardening)
- Scenarios and consumer types defined as server-side constants (not DB-backed yet)
- Email templates are AI-generated on-the-fly (no pre-defined templates)

## Build Status

- `pnpm build` — ✅ passes (types, vite build)
- Bundle size: 322 kB (up from 307 kB for 6 new page components)

## Next Steps (Phase 5-6)

- **Phase 5**: Report AI (usage analytics dashboard, usage charts)
- **Phase 6**: KETIK history persistence + PDKT mailbox CRUD
