# PDKT Email Interface Redesign

## Ringkasan

Redesign visual untuk workspace email PDKT agar lebih konsisten dengan `PRODUCT.md`, `DESIGN.md`, dan `docs/design.md`: product UI yang tenang, presisi, readable, dan tidak dekoratif.

## Scope

- `apps/web/src/routes/pdkt/simulation.tsx`
- `apps/web/src/routes/pdkt/components/MailboxSidebar.tsx`
- `apps/web/src/routes/pdkt/components/EmailDetailPane.tsx`
- `apps/web/src/routes/pdkt/components/ReplyComposer.tsx`
- `apps/web/src/__tests__/pdkt-mailbox-bulk.test.tsx`

## Perubahan

- Tokenized shell, sidebar, detail pane, evaluation section, dan composer menggunakan `var(--bg)`, `var(--surface)`, `var(--border)`, `var(--fg)`, `var(--fg2)`, `var(--fg3)`, `var(--inv-bg)`, dan `var(--inv-fg)`.
- Menghapus soft-shadow dan side-stripe accent tebal dari surface PDKT email interface.
- Membatasi `var(--module-pdkt)` untuk orientasi aktif/status, bukan dekorasi besar.
- Memperbesar affordance icon-only button penting ke touch target yang lebih nyaman.
- Mempertahankan behavior mailbox: search, filter, selection, reply, delete, bulk delete, evaluation state, retry, attachment zoom, thread history, dan mobile list/detail switching.
- Memperbaiki mock path di `pdkt-mailbox-bulk.test.tsx` agar test benar-benar memock `src/lib/api`.

## Verifikasi

- `pnpm --filter @trainers/web test src/__tests__/pdkt-mailbox.test.tsx src/__tests__/pdkt-mailbox-bulk.test.tsx`
- Impeccable design hook tidak menemukan deterministic design-quality issue pada file UI yang disentuh.
