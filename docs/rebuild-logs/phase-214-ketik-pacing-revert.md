# Phase 214 — KETIK Pacing Revert (kembali ke 1-20s)

- **Tanggal:** 2026-09-04
- **Pemicu:** Fajar — respon konsumen AI KETIK terlalu lama setelah `6c11ccb` (minute-aware pacing: 45-95s).
- **Keputusan:** revert penuh ke perilaku sebelum `6c11ccb`, sesuai permintaan "kembalikan seperti sebelumnya saja".

## Yang diubah (working tree → commit ini)

| File | Perubahan |
|------|-----------|
| `apps/web/src/routes/ketik/lib/pacing.ts` | Kembali identik ke pra-`6c11ccb`: `short` 1-3s, `normal` 5-10s, `long` 10-20s, `slow` 20-30s, `greeting_reply` 2-6s; `isSlowEligible` lama aktif lagi; simbol `FAST_SAME_MINUTE_RANGES` / `shouldUseFastSameMinute` / `getRealisticRange` / `FAST_CHANCE` dihapus |
| `apps/web/src/routes/ketik/components/ChatInterface.tsx` | Slow-path lama + threshold `remaining <20` kembali; hanya `imageAlts` dari `9d4a6ba` yang dipertahankan |
| `apps/web/src/routes/ketik/lib/pacing.test.ts` | Dihapus (file lahir di `6c11ccb`, mengunci angka 45-95s; tak direferensikan config/CI) |
| `plan/markdown/ketik-minute-aware-pacing.md` | (ignored, tak masuk commit) ditandai REVERTED 2026-09-04 |

## Verifikasi

- Codex `gpt-5.6-sol` medium audit: runtime revert SAFE (6 cek: 5 SAFE + 1 catatan plan basi yang sudah dibereskan)
- `pnpm --filter @trainers/web exec tsc --noEmit` → PASS
- `vitest run src/__tests__/ketik-chat-interface.test.tsx` → 9/9 PASS
- `eslint` 2 file → 0 errors (1 warning pre-existing `currentUserId` unused)
- `git diff --check` → clean

## Catatan

- Default model tetap `gemini-3.8-flash` (phase-213) — yang di-revert hanya pacing, bukan model.
- `docs/modules.md` tidak menyebut minute-aware pacing, jadi tidak ada yang perlu disinkronkan di sana.
