# Performa gelombang 3: lampiran skenario ke Storage

Audit: /mnt/project-files/audit-performa/laporan.md (2026-10-19). Wave 1: PR #117. Wave 2: PR #118.

## Requirement

KETIK scenario images and PDKT attachments (images and PDFs) were stored as base64 data URLs inside JSON and copied into every session, mailbox item and history row, so each read downloaded them again (Supabase egress, Free plan 5 GB). Store each file once in Storage and keep only its URL in the JSON. Fajar approved preparing this on 2026-10-19; the production migration and backfill run from his machine.

## Design

- Migration `20261019120000_scenario_attachments_storage.sql`: public bucket `scenario-attachments` (10 MB, png/jpeg/gif/webp/avif/bmp/pdf), no `storage.objects` policies (service role writes, clients cannot upload or list). Objects are named `<sha256 of bytes>.<ext>`: stored once, URL never changes, `Cache-Control: max-age=31536000`.
- `apps/api/src/lib/scenario-attachments.ts`: `externalizeScenarioAttachments(value)` swaps every supported data URL in a value for its public URL. Applied where attachments enter: KETIK `saveSettings`, PDKT `POST /settings`, and `createMailboxItem` (covers manual, AI-generated and retry-draft attachments). Every copy (session snapshot, mailbox, history, assignment) is made from these. An upload failure fails the save; there is no inline fallback.
- Backfill for older rows: `backfillScenarioAttachments()` with service-role RPCs `scenario_attachment_backfill_scan/fetch/apply`. Each call reads one page by primary key (under the 8 s statement timeout). A file is downloaded once (keyed by the md5 of its JSON literal), and the literal is swapped for the URL inside the database, so concurrent edits to other fields are kept. CLI: `pnpm --filter @trainers/api backfill:scenario-attachments`. Re-running changes nothing.
- Web: PDKT attachments may now be links. `detectMimeType.ts` passes links through, treats `.pdf` links as PDF, and `EmailAttachments` opens a PDF link directly. KETIK already accepted `https:` image sources.

## Production order

1. Fajar applies the migration (additive; old code keeps working).
2. Merge the PR (API and web deploy). Merging first would make saves with new attachments fail until the bucket exists.
3. Fajar runs the backfill once.

## Tasklist

- [x] RED: `scenario-attachments-api.spec.ts` (new real-backend spec: KETIK settings, PDKT settings with PDF, new PDKT email, backfill) and `pdkt-flow.spec.ts` (link image and PDF attachments).
- [x] GREEN; regression: `pdkt-flow`, `pdkt-resilience` browser, API projects `ketik-session`, `pdkt-resilience`, `pdkt-review-evidence`, `ketik-assignment`, `ketik-history`, `db-guard`.
- [x] `ketik-session-api.spec.ts`: attachment `src` is now the Storage URL; the provider stub also answers Gemini (KETIK coerces its model to Gemini, which made the spec fail on main).
- [x] `exposed-function-guard-api.spec.ts`: the six backfill functions are service-role only by design.

## Notes

- Raw base64 attachments without a `data:` prefix (legacy) are left as they are.
- Backfilling `user_settings` bumps `updated_at` (trigger), so someone with Pengaturan open gets one "settings changed" conflict and reloads.
- Pre-existing failures, also on main: `pdkt-resilience-api` "generated attachment images are costed at the image rate", `ketik-assignment-api` "assignment copies server settings…" (expects `gpt-5.4-mini`), and `exposed-function-guard-api` D5.1 lists 8 other revoked functions.
- Still open from the audit: slimmer PDKT history and KETIK turn RPCs, Telefun history list slimming, Telefun connecting during the ring, indexes.
