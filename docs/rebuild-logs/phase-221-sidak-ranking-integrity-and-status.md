# Phase 221 — SIDAK Ranking Integrity dan Status Responsif

Tanggal: 2026-09-22
Scope: memperjelas ranking prioritas temuan, membatasi populasi ranking sesuai scope, dan menghilangkan duplikasi status perubahan posisi pada desktop.

## Perubahan

- Ranking memakai competition rank berbasis jumlah defect; tie-break nama hanya mengatur urutan baris.
- `rankChange` dihitung sebagai `previousRank - currentRank`: positif berarti prioritas naik menuju rank lebih kecil, negatif berarti prioritas turun, `0` tetap, dan `null` agent baru.
- Leader tanpa agent scope ditolak dengan `403`; agent/folder non-service dikeluarkan dari populasi SIDAK.
- Link Top Agents mempertahankan query `service_type` yang aktif.
- `/sidak/ranking` memakai layout flat tanpa dekorasi ranking yang tidak actionable; label `Fatal` dihapus.
- Catatan `Berbagi peringkat dengan ...` dipisahkan dari status perubahan posisi.
- Status perubahan hanya terlihat sekali: kolom **Perubahan posisi** pada desktop, atau di bawah nama pada mobile.
- Filter dan nama agent tetap dapat dioperasikan dengan keyboard; tabel mobile tidak memaksa horizontal scroll.

## Dokumentasi

- `docs/SIDAK_LOGIC_AND_SCORING.md` mencatat formula rank change, arti naik/turun, tie, status responsif, dan penghapusan label Fatal.
- `docs/modules.md` menyamakan deskripsi modul SIDAK dengan kontrak ranking aktif.

## Verifikasi

- Focused API SIDAK Vitest: PASS.
- Focused web ranking Vitest: PASS — 4 tests.
- Web TypeScript check: PASS.
- ESLint file ranking: PASS.
- Production web build: PASS.
- Impeccable detector: tidak menemukan violation.
- `git diff --check`: PASS.
