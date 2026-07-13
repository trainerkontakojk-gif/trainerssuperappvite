# PDKT Bug-Bounty Hardening — 13 Juli 2026

## Scope

Implementasi mengikuti validasi baseline commit `03c8c6c` dan hanya mencakup temuan PDKT yang tervalidasi:

- archived replay dipisahkan dari server-state `useApi`;
- evaluation polling diberi in-flight guard, terminal deduplication, batching, dan cleanup;
- draft reply diidentifikasi dengan stable mailbox ID;
- tiga surface PDKT yang masih light-only memakai design tokens;
- redundant scenario resolver fallback dibersihkan.

Temuan strict email count (#5) tidak diubah karena kontrak PDKT tetap Single-Turn. Perubahan KETIK yang sudah ada di working tree tidak disentuh.

## Verification notes

- Regression coverage ditambahkan untuk mailbox replay, polling lifecycle, draft isolation, dan theming contract.
- `docs/design.md` menjadi source of truth untuk neutral surfaces, borders, text, status colors, dan modal scrim.
- Plan lengkap tersimpan di `plan/markdown/pdkt-bug-bounty-hardening.md` (folder `plan/` tetap gitignored sesuai konfigurasi repo).

## Post-implementation review

Review terhadap implementasi awal menemukan dan menutup gap berikut:

- polling retry tidak lagi membaca status `failed` lama saat request retry masih dimulai; request aktif dijaga dan status `failed` lama diberi grace window terbatas sampai worker terlihat berjalan;
- polling membaca mailbox terbaru melalui ref sehingga refetch tidak me-restart interval atau membatalkan terminal callback yang sedang berjalan;
- archived replay dibersihkan untuk seluruh jalur pemilihan mailbox riil, termasuk pilihan dari History dan auto-selection;
- response polling yang identik tidak lagi membuat object evaluation baru dan render yang tidak perlu;
- semantic status text memakai pasangan light/dark berkontras lebih tinggi;
- formatting churn di `session-service.ts` dibuang sehingga diff backend hanya berisi resolver cleanup.

Verifikasi final:

- polling tests: 6/6 pass;
- mailbox tests: 14/14 pass;
- ReplyComposer tests: 3/3 pass;
- theming contract tests: 4/4 pass;
- settings modal tests: 8/8 pass;
- API PDKT evaluation + session tests: 46/46 pass;
- web dan API `tsc --noEmit`: exit 0;
- scoped ESLint: 0 error, 4 warning lama di `simulation.tsx`;
- Impeccable detector: tidak ada finding;
- web production build: exit 0;
- `git diff --check`: exit 0.
