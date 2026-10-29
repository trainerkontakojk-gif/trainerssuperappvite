# Dependency security patches — 29 Oktober 2026

## Requirement

- Lane D: patch keamanan dependency repo dan upgrade Node lokal, sesuai pilihan Fajar. Tidak ada upgrade major, update rutin React/Vite/TanStack/SDK, perubahan produk, commit, push, deploy, remote DB mutation, atau penggantian package manager.
- Pertahankan dirty work `plans/markdown/telefun-tone-direction.md`, `apps/web/public/telefun/`, dan `scripts/telefun/`.
- Audit awal: 923 pasangan paket-versi, 34 advisory unik pada 15 paket. Evidence lokal: `/Users/nadindyta/.hermes/cache/scratch/trainers-dependency-audit-20261029/AUDIT.md`. Jangan menganggap semua advisory sebagai exploit aplikasi.
- Fajar menyetujui satu probe keamanan non-E2E terisolasi untuk crash Undici, selain E2E aplikasi. Tidak ada izin menjalankan suite unit/Vitest lainnya.
- Fajar menyetujui binary resmi Node 26.12.1 di `/usr/local/lib/nodejs`; backup symlink `/usr/local/bin/node` lalu arahkan ke binary baru. Pertahankan Node Homebrew lama dan npm; jangan upgrade dependency Homebrew lain.

## Design

### Scope dependency

- Direct API Undici 7.30.0 → 7.30.1.
- Vitest dan coverage 4.1.11 → 4.1.12, selaraskan semua workspace tanpa Vitest 5.
- Target transitif minimum, sesuai major pemilik: Undici 8.12.2, DOMPurify 3.4.17, Seroval 1.6.11, fast-uri 3.1.9, ip-address 10.7.4, body-parser 2.4.0, qs 6.16.1, brace-expansion 5.0.12, Browserslist 4.28.7+, baseline-browser-mapping 2.11+, source-map-js 1.2.2, systeminformation 5.33.16.
- Gunakan override terarah yang cocok pola repo dan hindari downgrade salinan yang sudah patched. Hasil lockfile harus dibandingkan dengan baseline; tidak menerima update rutin dependency unrelated secara diam-diam.
- Zod 3 transitif dan deepmerge: jangan memaksa Zod 3 → 4 atau membuat patch upstream tanpa scope tambahan. Periksa apakah ada patch kompatibel; jika tidak, dokumentasikan advisory tersisa beserta owner, exposure, dan blocker. Tidak menyembunyikan advisory dengan ignore list.
- Perketat runtime floor/pin pada jalur Node yang sudah dipakai: Node 22.23.4; jalur 24 minimal 24.22.1 dan jalur 26 minimal 26.12.1. Local tetap major 26, CI tetap major 22. Jangan migrasi server/deploy secara implisit.
- Tidak mengubah allowBuilds/release-age exclusions/CI pipeline yang tidak diperlukan untuk patch ini.

### Files owned

- `package.json`, workspace `package.json` bila runtime floor/patch minimum berubah.
- `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.node-version`, `Dockerfile.render` untuk runtime/security floor yang relevan.
- `scripts/deployment/undici-response-security-smoke.mjs`: satu probe lokal repeatable yang disetujui.
- Dokumen ini, `docs/deployment.md` hanya bila kontrak runtime perlu dikoreksi, dan laporan hasil `docs/dependency-security-patches-2026-10-29.md`.
- Binary resmi Node dan symlink lokal sebagaimana approval; tidak ada file Hermes/config shell yang diubah.

### Verification and failure modes (before probe implementation)

Probe memakai child process terpisah untuk Undici API, Undici cabang jsdom, dan fetch bawaan Node. Seluruh server HTTP bind `127.0.0.1`, port ephemeral. Child menerima env allowlist tanpa secret, tidak memuat env app atau DB/provider.

Daftar failure modes:

1. Resolusi paket menguji salinan/version yang salah: laporkan versi dan lokasi modul actual, pilih melalui pemilik API/jsdom yang nyata.
2. Transport normal rusak: request `/valid` harus menghasilkan status/body exact sebelum dan sesudah stimulus.
3. Respons berbahaya salah diterima: >5 content-encodings dengan truncated body wajib ditolak.
4. Promise ditolak tetapi error stream terlambat tetap membunuh proses: tunggu dan lakukan request valid kedua; jangan pasang uncaughtException handler yang menyamarkan crash.
5. Child hang/timeout/signal/parse output gagal: parent harus exit nonzero, bukan synthetic PASS.
6. Stimulus tidak benar-benar dikirim: server catat jumlah request valid/malformed dan nilai content-encoding yang ditulis.
7. Fixture/socket bocor: tutup semua socket/server; deadline child bounded.
8. Egress/secret tak sengaja: hanya URL yang dibuat dari listener loopback, env allowlist, tidak ada provider/DB.

RED: probe pada binary dan dependency sebelum perubahan; expected failure adalah crash Undici/process, bukan timeout atau syntax error. GREEN: probe sama, tidak dilonggarkan, pada Node/dependency patched.

E2E existing: `gemini-egress-proxy-api.spec.ts` dengan project API terkait membuktikan proxy/direct/failure/sanitization aktual; browser `landing-auth.spec.ts` dan `sidebar-nav-state.spec.ts` membuktikan SPA/auth/navigation. Periksa config dan helper loopback/fail-closed sebelum run. Gunakan output scratch unik agar tidak menghapus artefak repo.

Final gates serial: native `pnpm audit --prod` dan full audit bila endpoint tersedia; OSV semua exact lock versions sebagai cross-check; focused E2E; root lint/typecheck/build, local Turbo cache only dan concurrency 1; `git diff --check`. Tidak ada unit suite kecuali satu probe yang telah disetujui. `thermo-nuclear` tidak tersedia pada host ini; gunakan self-review specialist dependency/security checklist, tanpa mengarang skill atau mendispatch agent.

## Tasklist

- [x] Scope/approval, workflow, dirty-state baseline dan patch metadata dikumpulkan.
- [x] Probe terisolasi ditulis, RED direproduksi dan evidence disimpan.
- [x] Patch dependency minimum diterapkan; lock drift dan peer setelah install ditinjau.
- [x] Binary resmi Node diverifikasi checksum, symlink lama dibackup, binary baru dijalankan.
- [x] Probe GREEN 3/3, E2E API 12 + browser 11 + PDF 1 lulus; root lint/typecheck/build fresh diulang setelah koreksi peer, semuanya exit 0.
- [x] Native audit + OSV final dan daftar residual diverifikasi: prod 0, full 2 dev-only (Zod3 High/deepmerge Low) tetap di luar scope major/unpublished fix.
- [x] Graphify local cache selesai, exit 0 tanpa LLM; graph dan report lokal diperbarui. HTML visualization dilewati otomatis karena node count di atas limit, bukan kegagalan ekstraksi.
- [x] Dokumentasi runtime/hasil diselesaikan; status dirty work dan diff final diperiksa. Tidak ada commit/push/deploy.
