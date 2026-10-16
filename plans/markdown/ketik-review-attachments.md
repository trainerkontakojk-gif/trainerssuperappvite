# KETIK: open historical scenario attachments in Telaah

Lane D: additive authorized history-detail API contract, backend snapshot projection and UI rendering. User authorized local fixes. Preserve all pre-existing feedback/navigation changes from this conversation. No commit/push/deploy/remote migration.

## Requirement

- Show images actually sent in the session transcript (`SEND_IMAGE` markers), with clickable previews in Telaah.
- Resolve sources and alt text from that session's immutable backend snapshot, never current settings or scenario-title matching.
- Do not reveal unsent images, scripts, or configuration through detail/list/summary. Preserve detail authorization for owner/admin/assigned trainer.
- Legacy histories without a snapshot show an honest unavailable attachment; unsupported/missing sources and load errors remain explicit.
- Opening/closing works with keyboard, Escape, focus restoration, desktop/mobile and the Telaah overlay. Preserve annotations and typo highlights.

## Design

- Add optional `attachments` only to `KetikHistoryDetail`, containing referenced index/src/alt. Backend reads the ended session snapshot only after existing history authorization, bound to canonical owner/history id; no database/schema migration.
- Detail-only projection validates image sources (http(s), root-relative, supported raster data URLs). No server-side remote fetch.
- Extract annotated message content into a small component, retaining text quote/typo rendering; replace image tags with image buttons/unavailable notices.
- Use installed Base UI/shadcn Dialog, portal inside Telaah layer, descriptive title/alt, visible close action and focus restoration. No new dependency or changes to live-chat lightbox/replay behavior.

## Tasklist

- [x] Inspect persisted sessions/history types, source renderer, Graphify and canonical workflow/TDD adapter.
- [x] RED browser E2E for text+multiple image markers, open/close/reload, missing/unavailable image, desktop/mobile, annotations.
- [x] RED real-backend E2E for immutable snapshot, sent-only projection, legacy/missing snapshot, owner denial and safe DB failure.
- [x] GREEN backend projection/types and Telaah attachment UI.
- [x] Focused regression, typecheck/lint/build, thermo-nuclear and Impeccable review.
- [x] Final scoped diff check, one graph update and recorded verification/limitations.

## Verification evidence

- Preserved pre-existing feedback/navigation edits; new paths are history attachment projection, detail type, Telaah message/preview, detail-state retention, focused tests and docs. No migration.
- Browser RED: 2 tests fail on missing image button and missing unavailable-attachment copy. Backend RED: real session start/turn/finish/history returns no attachments. No Vitest/unit tests.
- GREEN full Telaah: `E2E_APP_ORIGIN=http://localhost:3006 pnpm --dir apps/web exec playwright test --config test-results/ketik-config.ts ketik-flow.spec.ts --grep 'KETIK Telaah' --trace on` — 18 passed, exit 0. Task-owned config retains the normal loopback E2E env and no server reuse; SIDAK :3005 remains untouched.
- Final focused rerun after key/focus/fixture refinements: same browser command with `--grep 'lampiran Telaah|lampiran lama'` — 2 passed, exit 0; includes actual decoded image dimensions, desktop/mobile, Escape/button close, restored focus, reload, annotations/typos, unavailable source, failed image retry, no pageerror and fail-closed network assertions.
- Backend: `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project ketik-session-real-backend --grep 'historical attachments|snapshot survives' --trace on` — 2 passed, exit 0. Real JWT/Hono/DB/session finalization; local provider transport only. Changed settings preserve historical sources; unsent indices, agent-typed markers, unsafe URL and scenario script are excluded; cross-owner 404; attachment query error gives safe 500; legacy without snapshot returns empty attachments; list omits attachment payload.
- History regression: `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project ketik-history-real-backend --grep 'stable bounded pages|server search/status|database failures' --trace on` — 3 passed, exit 0. Pagination/detail, owner denial, summary/search and safe failure paths preserved.
- Backend edge found during GREEN: shared display normalizer reclassifies any image-tagged text as consumer. Attachment projection therefore inspects original stored senders, so agent-written markers cannot expose unsent images. Shared display behavior was not changed.
- Impeccable detector on Stage/message/preview: exit 0, empty finding list. Desktop/mobile screenshots inspected; final capture disables transient animations. Initial mobile capture was mid-fade; final capture confirms modal bounds, contrast and close action.
- Thermo-nuclear self-review: backend projection 73 lines; message renderer 82; preview 93; Stage 464. No giant-file growth, duplicated scoring/authorization or new dependency; data URL content is not used as React keys. Read authorization precedes snapshot query, owner/history/state are bound, only referenced image sources cross the API boundary, DB failure is not converted to success.
- Context7 `/mui/base-ui/v1.8.0` confirms controlled Dialog and RefObject finalFocus; installed Dialog wrapper supplies portal container to render inside the Telaah overlay.
- Artifacts: `apps/web/test-results/ketik-feedback/` (browser traces and `attachment-preview-{1280,390}.png`), `apps/web/test-results/api/` (latest history traces). Earlier runs' counts are in this task transcript; standard API output directory is overwritten between projects.

Limits: historical rows without an immutable snapshot cannot recover their original image sources reliably and deliberately show unavailable. Broken/expired remote image URLs remain explicit load errors. Supports existing scenario image attachments; replay/live-chat components unchanged. No paid-provider or hosted verification.

### Root checks

- `pnpm typecheck --concurrency=1`: exit 0, 4/4 tasks.
- `pnpm lint --concurrency=1`: exit 0, 4/4 tasks; existing warnings, none in new attachment components/service.
- `pnpm build --concurrency=1`: exit 0, 3/3 tasks.
- `git diff --check`: exit 0. No generated build files are tracked in the final path inventory. Pre-existing feedback/navigation paths remain preserved.
- No commit/push/deploy, migration, remote data mutation, or non-E2E tests.

- `graphify update .`: exit 0, completed once for this integrated attachment batch; `/tmp/ketik-attachments-graphify.log`.
- Task-started local Supabase stopped with `supabase stop --project-id trainerssuperappvite`: exit 0, backup volume retained. Task E2E server :3006 stopped automatically. Existing SIDAK server :3005 left untouched.
