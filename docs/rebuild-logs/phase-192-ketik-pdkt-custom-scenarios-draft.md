# Phase 192: KETIK/PDKT Custom Scenarios & Consumer Types via Draft Payload

## Problem

KETIK `POST /ketik/generate` dan PDKT `POST /pdkt/session/create` hanya bisa mencari scenario dan consumer type dari hardcoded `DEFAULT_SCENARIOS` / `DEFAULT_CONSUMER_TYPES` via ID lookup. Scenario/consumer type kustom yang dibuat lewat Settings UI (ScenariosTab, ConsumersTab) memiliki ID yang tidak dikenal backend → `404 Scenario atau consumer type tidak ditemukan`.

## Root Cause

Backend menyimpan data settings hanya sebagai blob JSON di tabel `module_settings`. Service layer menyediakan `getScenarios()` dan `getConsumerTypes()` yang me-merge default + custom, tapi route handler tetap melakukan lookup berdasarkan ID saja — tanpa fallback ke full draft object yang dikirim frontend.

## Solution

Implementasikan **draft-object pattern** untuk kedua modul: frontend selalu mengirim full object scenario + consumer type di samping ID, backend prioritaskan draft object over ID lookup.

### KETIK

- **`packages/types/src/ketik.ts`**: Tambah `ketikScenarioSchema`, `ketikConsumerTypeSchema`, `scenarioDraft` dan `consumerTypeDraft` di `generateMessageSchema`
- **`apps/api/src/routes/ketik.ts`**: Route `POST /generate` prioritaskan `scenarioDraft` / `consumerTypeDraft` atas ID lookup
- **`apps/web/src/routes/ketik/components/ChatInterface.tsx`**: Kirim `consumerTypeDraft` penuh, strip base64 `images` dari `scenarioDraft` (hindari payload besar)

### PDKT

- **`packages/types/src/pdkt.ts`**: Tambah `consumerTypeDraft` di `generateEmailSchema`
- **`apps/api/src/services/pdkt/session-service.ts`**: `resolvePdktGenerationConfig()` prioritaskan `scenarioDraft` / `consumerTypeDraft`
- **`apps/api/src/services/pdkt/mailbox-session.ts`**: Forward `consumerTypeDraft` ke session resolver
- **`apps/web/src/routes/pdkt/simulation.tsx`**: Kirim `scenarioDraft` + `consumerTypeDraft` di `POST /pdkt/session/create`
- **`apps/web/src/routes/pdkt/components/SettingsModal.tsx`**: Pass `consumerTypes` sebagai prop ke `PdktScenariosTab`
- **`apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx`**: Kirim `consumerTypeDraft` penuh, strip `attachmentImages` dari `scenarioDraft`

### Key Design Decisions

| Aspek | Keputusan |
|-------|-----------|
| **Payload size** | Base64 images di-strip dari draft sebelum dikirim (backend punya akses ke storage, frontend cukup kirim metadata) |
| **Prioritas** | Draft object > ID lookup. Jika draft ada, ID lookup di-skip. Backward compat: jika tidak ada draft, fallback ke ID lookup seperti sebelumnya. |
| **Consumer type** | PDKT `globalConsumerTypeId === "random"` di-resolve ke `"ramah"` (sama dengan legacy behavior) |
| **Types** | Zod schema untuk validasi runtime di route layer |

## Files Changed

| File | Change |
|------|--------|
| `packages/types/src/ketik.ts` | +`ketikScenarioSchema`, +`ketikConsumerTypeSchema`, +`scenarioDraft`/`consumerTypeDraft` fields |
| `packages/types/src/pdkt.ts` | +`consumerTypeDraft` field di `generateEmailSchema` |
| `apps/api/src/routes/ketik.ts` | Prioritaskan draft object atas ID lookup |
| `apps/api/src/services/pdkt/session-service.ts` | Prioritaskan draft object dalam config resolution |
| `apps/api/src/services/pdkt/mailbox-session.ts` | Forward `consumerTypeDraft` parameter |
| `apps/web/src/routes/ketik/components/ChatInterface.tsx` | Kirim `scenarioDraft` (tanpa base64) + `consumerTypeDraft` |
| `apps/web/src/routes/pdkt/simulation.tsx` | Kirim `scenarioDraft` + `consumerTypeDraft` |
| `apps/web/src/routes/pdkt/components/SettingsModal.tsx` | Pass `consumerTypes` ke PdktScenariosTab |
| `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx` | Kirim `consumerTypeDraft` + strip `attachmentImages` |

## Verification

- `pnpm typecheck` — packages/types ✓, apps/api ✓, apps/web ✓
- `pnpm test:core` — 166/166 passed (core suite)
