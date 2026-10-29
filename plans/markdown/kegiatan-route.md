# Route `/kegiatan`

Lane C — tambah URL utama untuk halaman Log Aktivitas.

Status: complete; focused route E2E and the full two-spec run pass.

## Requirement

- Sediakan halaman Log Aktivitas melalui `/kegiatan`.
- Gunakan halaman yang sama dan capability `admin.activityLogs.read` seperti `/dashboard/activities`.
- Arahkan tautan Administrasi dan breadcrumb ke `/kegiatan`; pertahankan `/dashboard/activities` sebagai alias kompatibilitas.
- Dokumentasikan kedua URL dan perilaku append-only.

## Design

Tambahkan deklarasi route TanStack Router yang memakai komponen `DashboardActivities` dan guard capability yang sama. Jangan membuat endpoint atau mengubah hak akses. Pertahankan route lama agar tautan tersimpan dan bookmark yang sudah ada tetap bekerja.

## Tasklist

- [x] Tambahkan `/kegiatan` dengan guard `admin.activityLogs.read`.
- [x] Arahkan navigasi Administrasi ke `/kegiatan` dan dukung breadcrumb di kedua URL.
- [x] Sinkronkan dokumentasi modul dan matriks akses.
- [x] Jalankan E2E halaman aktivitas untuk rute baru dan lama.
- [x] Jalankan typecheck web, lint workspace, dan `git diff --check`.

## Verification status

- `pnpm --filter @trainers/web exec tsc --noEmit` — exit 0.
- `pnpm --filter @trainers/web lint` — exit 0; 66 warnings, 0 errors.
- `git diff --check` — exit 0; plan baru juga diperiksa untuk trailing whitespace.
- `pnpm --dir apps/web exec playwright test activities.spec.ts home-staff.spec.ts --grep 'Log Aktivitas|trainer: urutan section' --workers=1` — exit 0; 5/5 passed, mencakup `/kegiatan`, alias lama, dan tautan beranda.
- `pnpm --dir apps/web exec playwright test activities.spec.ts home-staff.spec.ts --workers=1` — exit 1; 17 passed, 1 failed. Kegagalan terpisah di `home-staff.spec.ts:498`: chart SIDAK mengharapkan `dari=8`, menerima `dari=9`; tidak terkait rute aktivitas.
- Penyebab kegagalan itu: race di test. Label rentang langsung berganti, sedangkan href tautan SIDAK baru berganti setelah data tren diambil ulang, dan `expect(await link.getAttribute())` tidak menunggu. Assertion diganti `await expect(link).toHaveAttribute("href", /dari=8/)` dan `/sampai=8/`.
- `pnpm exec playwright test e2e/home-staff.spec.ts -g "tren temuan: kalimat" --workers=1 --repeat-each=3` (dari `apps/web`) — 3/3 passed.
- `pnpm exec playwright test e2e/activities.spec.ts e2e/home-staff.spec.ts --workers=1` (dari `apps/web`) — 18/18 passed.
- Graphify tidak tersedia di host ini; relasi rute, navigasi, dan tautan ditelusuri langsung lewat source dan `rg`.
- Pemanggilan awal melalui script memilih seluruh 911 test, bukan spec terpilih; dihentikan setelah 4 lulus dan 1 terinterupsi. Tidak ada hasil test yang dibuang dari run terfokus di atas.
