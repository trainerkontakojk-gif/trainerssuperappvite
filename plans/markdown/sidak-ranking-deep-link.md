# SIDAK Ranking Deep Link

## Requirement

`TopAgentsTable` di dashboard SIDAK membuka `/sidak/ranking?service_type=<layanan>&year=<tahun>` (kontrak #3 di `sidak-ranking-integrity-and-mobile-fix.md`). Halaman ranking tidak pernah membaca query itu, jadi dari dashboard Chat link "Lihat semua ranking" tetap membuka ranking Call tahun berjalan.

Acceptance:

1. `/sidak/ranking?service_type=chat&year=<Y>` membuka ranking dengan filter Layanan = Chat dan Tahun = `<Y>`, dan request pertama ke `/sidak/ranking` membawa `service_type=chat&year=<Y>`.
2. Query yang tidak valid (layanan tidak dikenal, tahun bukan angka empat digit) diabaikan; halaman jatuh ke default (Call, tahun berjalan).
3. Tanpa query, perilaku tidak berubah.
4. Leader yang terkunci ke satu layanan tetap terkunci; query tidak membuka layanan lain (normalisasi yang sudah ada tetap berlaku, dan backend tetap menegakkan scope).

Di luar scope: menulis perubahan filter balik ke URL, dan param `period`/`folder`.

## Design

- Ikuti preseden `/sidak/jadwal-shifting`: `validateSearch` di `sidakRankingRoute` (`apps/web/src/router.tsx`) hanya meneruskan `service_type` yang ada di `VALID_SERVICE_TYPES` (`@trainers/types`) dan `year` empat digit; sisanya dibuang.
- `SidakRankingPage` membaca `useSearch({ from: "/sidak/ranking" })` dan memakai nilainya hanya sebagai nilai awal `useState` untuk `selectedService` dan `selectedYear`.
- Dua jebakan router yang ditemukan saat GREEN: `useSearch({ strict: false })` mengembalikan query mentah, bukan hasil `validateSearch`; dan router menggabungkan hasil `validateSearch` di atas query mentah, jadi kedua kunci harus selalu dikembalikan (`undefined` bila tidak valid) agar nilai mentah tertimpa.
- Tidak ada perubahan backend atau kontrak API.

## Tasklist

- [x] RED: E2E deep link (Chat + tahun lalu) dan E2E query tidak valid di `apps/web/e2e/sidak-ranking.spec.ts`; konfirmasi gagal karena filter tetap Call.
- [x] GREEN: `validateSearch` di route + nilai awal dari `useSearch` di halaman.
- [x] Jalankan seluruh `sidak-ranking.spec.ts` dan `sidak-dashboard-insights.spec.ts`.
- [x] `thermo-nuclear` review.
- [x] Web typecheck, lint, build, `git diff --check`.

## Verification

- RED: `npx playwright test e2e/sidak-ranking.spec.ts` (dari `apps/web`, hanya Vite web yang berjalan): test deep link gagal dengan `Expected "chat" / Received "call"`.
- GREEN: `sidak-ranking.spec.ts` 7/7, termasuk leader terkunci dan query tidak valid.
- Regresi: `sidak-ranking`, `sidak-dashboard-insights`, `sidak-agent-detail` 24/24.
- `pnpm lint` exit 0 (0 error, warning lama), `pnpm build` exit 0, web `tsc --noEmit` exit 0, `git diff --check` bersih.
- `thermo-nuclear`: PASS dengan dua catatan P3 (lihat laporan sesi): state awal tidak ikut berubah bila query berganti saat halaman sudah terbuka (tidak ada jalur di UI yang memicunya), dan tahun empat digit yang tidak ada di `availableYears` menghasilkan ranking kosong dengan select yang menampilkan opsi pertama (backend tetap menolak di luar 2000–2100).
