# Telefun — panggilan memakai mikrofon yang dicek

## Requirement

Laporan Fajar (2026-10-23): headset Jabra terhubung, tetapi panggilan merekam mikrofon laptop. Lane C: perbaikan perilaku lintas komponen frontend, tanpa perubahan API/server/skema.

- Setelah izin mikrofon, tampilkan pilihan audioinput bila perangkat lebih dari satu; nilai awal mengikuti track aktual, label dan meter mengikuti pilihan.
- Perbarui daftar saat devicechange. Satu perangkat tetap berupa baris sederhana.
- Ingat deviceId per browser dengan localStorage yang aman terhadap kegagalan. Pilihan tersimpan yang hilang kembali ke default hanya di dialog, terlihat melalui nama perangkat aktual.
- Teruskan deviceId track cek mic hingga getUserMedia sesi dengan constraint exact. Tanpa id, pertahankan perilaku lama.
- Perangkat hilang saat mulai panggilan harus gagal jelas dalam bahasa Indonesia, tanpa mencoba mikrofon lain dan tanpa sambungan parsial.
- Meter panggilan mengamati stream sesi, bukan membuka perangkat default sendiri.

## Design

- `MicCheck.tsx`: enumerasi setelah izin, select native berlabel Mikrofon, pergantian stream dengan cleanup/cancellation, listener devicechange, penyimpanan deviceId terbaik-usaha. Style mengikuti baris saat ini dan token `docs/design.md`.
- `index.tsx`: simpan id hasil track terpisah dari pengaturan tersimpan; sertakan dalam konfigurasi panggilan aktif/retry saja.
- `PhoneInterface.tsx`, `telefunTransport.ts`, `liveSession.ts`: teruskan pilihan lewat opsi connect; map kegagalan perangkat exact ke pesan pemulihan, bersihkan audio, tanpa fallback saat mulai panggilan.
- `useMicrophoneActivity.ts`: periksa jalur stream injeksi; cegah pembukaan mikrofon sendiri saat stream sesi belum ada melalui kondisi aktif di `PhoneInterface.tsx`.
- `docs/telefun.md`: dokumentasikan pemilihan, persistensi lokal, dan kegagalan exact. Cek yang gagal karena perangkat hilang memakai pesan perangkat, bukan pesan penolakan izin.
- E2E hermetic memakai media palsu Chromium, dua audioinput tiruan dan server suara/API tiruan. Hanya target loopback, satu worker dan satu perintah verifikasi pada satu waktu.
- Graphify menemukan relasi MicCheck → index; integrator memperbarui graph setelah integrasi. Tidak ada commit/push/deploy atau perubahan remote oleh worker.

## Tasklist

- [x] RED: E2E pilihan Jabra diteruskan, persistensi setelah reload, gagal exact tanpa fallback, satu perangkat, hotplug; perluas persistensi hilang/storage diblokir. RED tambahan untuk pesan perangkat saat cek gagal.
- [x] GREEN: implementasi pemilih dan persistensi aman.
- [x] GREEN: teruskan id ke sesi dan tampilkan kegagalan exact melalui jalur error lama.
- [x] Konfirmasi meter memakai stream sesi dan cleanup aman.
- [x] Jalankan setiap test fokus GREEN dan regresi dua file Telefun secara serial (6 + 8 + 12 lulus).
- [x] Typecheck web dan E2E, eslint file berubah, prettier, git diff --check; build web.
- [x] Review thermo-nuclear dan audit Impeccable; perbaiki target sentuh 44px dan pesan perangkat hilang.
- [x] Tulis laporan bukti dan pastikan proses sementara sudah berhenti.
- [x] Review orkestrator (Claude Code, perbaikan langsung): pilihan hanya disimpan saat dipilih di select, sehingga fallback default saat headset dicabut tidak menimpa pilihan Jabra (RED di test persistensi, lalu GREEN); test persistensi diberi batas waktu 120 dtk karena tiga panggilan dan empat muat halaman; perapian format di `PhoneInterface.tsx` dan `liveSession.ts` di luar scope dikembalikan. Verifikasi ulang serial: mic 6, call 12, consumer-prompt 8 lulus.
