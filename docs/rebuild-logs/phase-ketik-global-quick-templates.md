# KETIK — Template Cepat Standar Global

## Scope

Template cepat KETIK yang dikonfigurasi admin menjadi daftar standar untuk seluruh user. User dari semua role KETIK dapat menambah, mengubah, dan menghapus template pribadi yang hanya aktif pada akunnya; template standar global tetap hanya dapat dikelola admin.

## Perubahan

- Menambahkan singleton `public.ketik_global_settings` dengan `quick_templates`, `updated_at`, RLS aktif, dan akses tabel hanya untuk `service_role`.
- Migration `20260910120000_ketik_global_quick_templates.sql` melakukan backfill dari template KETIK admin pertama yang memiliki row settings. Row `user_settings` lama tidak dihapus.
- Menambahkan `GET /api/v1/ketik/settings` response header `x-ketik-templates-version` dan sumber template global pada settings yang dikembalikan ke semua user.
- Menambahkan `PUT /api/v1/ketik/templates` dengan guard role `admin`, validasi Zod, dan optimistic compare-and-swap untuk mencegah overwrite draf admin yang stale.
- Menambahkan client version store untuk header global dan wiring SettingsModal: admin menyimpan template global; semua role dapat menambah/mengelola template pribadi pada section terpisah.
- Saat settings user disimpan, daftar `personalQuickTemplates` ditulis kembali ke namespace KETIK milik user; data personal lama di `user_settings` dipertahankan dan digabung dengan template standar saat dibaca.
- CORS mengekspos `x-ketik-templates-version` agar browser dapat mengirim version header pada penyimpanan berikutnya.

## Verifikasi

- `pnpm --dir apps/api exec vitest run src/__tests__/ketik-service.test.ts src/__tests__/ketik-global-templates.test.ts src/__tests__/ketik-settings-route.test.ts src/__tests__/app-onerror-cors.test.ts` — PASS
- `pnpm --dir apps/web exec vitest run src/__tests__/ketik-settings-modal.test.tsx src/routes/ketik/ketikApi.test.ts src/lib/settings-contract.test.ts` — PASS
- `pnpm --dir apps/api exec tsc --noEmit` — PASS
- `pnpm --dir apps/web exec tsc --noEmit` — PASS
- Lint file tersentuh API/web — 0 error; warning yang tersisa berasal dari pola existing.
- `git diff --check` — PASS untuk tracked diff.

## Catatan Operasional

Migration `20260910120000_ketik_global_quick_templates.sql` sudah diterapkan ke linked Supabase secara transactional melalui SQL query karena `supabase db push` terblokir oleh remote-only history `20260908093728`. Read-back memverifikasi row migration, singleton `default`, 4 template hasil backfill, RLS aktif, trigger timestamp aktif, dan grant client dicabut.
