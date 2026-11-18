# KETIK — longer scenario image descriptions (imageAlts)

Status: implemented and verified (2026-11-18)
Lane: C (shared API contract limit + settings route error shape + settings UI)

## Requirement

Fajar's KETIK settings store image descriptions (`scenario.imageAlts[i]`) longer than 500 characters on purpose: since 2026-10-21 the AI consumer treats each description as facts about the attachment, so detailed descriptions are useful. Today any save of KETIK settings (even changing only "Durasi sesi") is rejected because two stored descriptions exceed `KETIK_PROMPT_LIMITS.imageAlt = 500`, and the UI shows the raw Zod issue JSON.

Acceptance:

1. `PUT /ketik/settings` accepts an image description of up to **2000** characters (new `KETIK_PROMPT_LIMITS.imageAlt`) and persists it unchanged.
2. A description over the limit is still rejected with HTTP 400, but the response is a human-friendly Indonesian message (no raw Zod JSON) that names which scenario (title) and which image label (the `#<idx>` shown in the editor) is too long and states the limit. Other invalid-settings failures get a generic friendly message.
3. The scenario editor lets the trainer read and edit a long description comfortably: multi-line field (existing `SettingsTextarea`), `maxLength` = the new limit, and a visible character count near the limit. The editor must still prevent typing past the limit.
4. Everything that consumes `imageAlts` (prompt policy, attachment matching, prompt-injection scan, history attachments, session snapshots) keeps working with long descriptions; no silent truncation of stored text.

Out of scope: other KETIK limits, Telefun/PDKT, the templates route error shape, prod data edits.

## Design

- `packages/types/src/ketik.ts`: change `KETIK_PROMPT_LIMITS.imageAlt` from 500 to 2000. `ketikScenarioSchema` already references the constant, as do `KetikScenariosTab.tsx` (`maxLength`, `handleAltChange` guard). Rebuild `packages/types` if its `dist/` is consumed.
- `apps/api/src/routes/ketik.ts` `PUT /settings`: give `zValidator("json", ketikAppSettingsSchema, hook)` a result hook (same pattern as `apps/api/src/routes/ai.ts` `/monitoring/pricing`). On failure, find the first issue whose path is `["scenarios", s, "imageAlts", i]` with code `too_big`; respond 400 `{ success:false, error:{ code:"VALIDATION_ERROR", message:"Keterangan gambar #<i> pada skenario \"<title>\" melebihi <limit> karakter." } }` (title from the raw body when available, else "ke-<s+1>"). Otherwise a generic `"Pengaturan KETIK tidak valid. Periksa kembali isian Anda."`. Keep the message builder small and local (or in `services/ketik/`), not a generic framework.
- `apps/web/src/routes/ketik/components/settings/KetikScenariosTab.tsx`: replace the single-line alt `SettingsInput` with `SettingsTextarea` (a few rows), keep `aria-label` `Keterangan gambar <n>`, add a compact `panjang/limit` counter. Widen the per-image card if needed so the textarea is usable; follow `docs/design.md` (12px text floor, tokens).
- Frontend already surfaces `error.message` from `unwrapResponse`; confirm the friendly message reaches the settings error area unchanged.

## Tasklist

- [x] RED: focused API E2E (extend the closest existing KETIK settings/API spec, e.g. `apps/web/e2e/ketik-consumer-prompt-api.spec.ts` or a new focused `ketik-settings-image-alt-api.spec.ts`) asserting: 1500-char alt saves (200) and round-trips via GET; 2001-char alt returns 400 with the friendly message naming the scenario title and `#<idx>` and containing no `"origin"`/`"too_big"`. Run it, confirm it fails for the expected reason.
- [x] RED: focused browser E2E for the editor: alt field is a textarea, accepts >500 chars, shows counter, Simpan succeeds.
- [x] GREEN: raise the limit, add the validator hook + message, switch the alt field to textarea with counter.
- [x] Check every `imageAlts` consumer listed above for assumptions about short text.
- [x] `pnpm --filter @trainers/api typecheck`, `pnpm --filter @trainers/web typecheck`, affected lint.
- [x] `thermo-nuclear` review, then `verify`, CHANGELOG entry, commit + push to `main` per AGENTS.md.

## Verification notes

- API RED reproduced the HTTP 400 on the 1,500-character save and exposed raw Zod errors for the two invalid payloads. API GREEN passed all three cases with real Hono, JWT, and loopback Postgres. The valid case round-tripped both 1,500 and 2,000 characters exactly.
- Browser RED found a single-line input. Browser GREEN verified multiline editing, the character counter, the typing limit, and the exact settings save payload with a hermetic API fixture.
- Prompt history accounts for attachment descriptions in the existing total prompt budget. Attachment matching and the injection scan read the full values, and session snapshots retain them. History thumbnail alt text still has its separate 500-character display cap. Settings and snapshots store the full text.
