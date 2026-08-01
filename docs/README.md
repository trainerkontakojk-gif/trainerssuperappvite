# 📚 Indeks Dokumentasi Trainers SuperApp

Selamat datang di pusat panduan Trainers SuperApp! Dokumen ini dirancang sebagai peta navigasi utama untuk membantu seluruh anggota tim—baik manajemen, perancang antarmuka, hingga pengembang teknis—memahami cara kerja dan aturan sistem kami.

---

## 🌟 Panduan Cepat untuk Pengguna Umum (Human-Readable Reader)

Jika Anda baru mengenal proyek ini atau ingin memahami gambaran besar tanpa pusing dengan kode, silakan mulai dari sini:

- **[README.md](../README.md):** Pengenalan produk, fungsi utama aplikasi, dan cara menjalankan aplikasi di komputer Anda.
- **[docs/modules.md](modules.md):** Penjelasan fungsional dari masing-masing modul pelatihan (Ketik, PDKT, Telefun, Profiler, dan SIDAK) beserta manfaat nyata bagi pelatih dan peserta.

---

## 🛠️ Panduan Teknis untuk Pengembang (Developer & Agent Reader)

Gunakan dokumen spesifik di bawah ini saat memodifikasi modul untuk memastikan kepatuhan terhadap aturan sistem (_guardrails_) dan prosedur pengujian:

### Mulai Dari Sini

- `README.md`: Ringkasan produk, setup lokal, env, dan command operasional.
- `docs/architecture.md`: Arsitektur Monorepo (Vite + Hono + Supabase/AI), struktur folder, pola data flow, dan workflow verifikasi.
- `docs/AGENT_WORKFLOW.md`: Agent context workflow — hierarki sumber kebenaran, aturan konflik, dan checklist wajib.
- `docs/PHASE_PROGRESS.md`: Riwayat lengkap fase pengembangan (arsip historis dari `AGENTS.md`).
- `docs/modules.md`: Status fitur per modul: Dashboard, KETIK, PDKT, TELEFUN, Profiler/KTP, dan SIDAK.
- `docs/auth-rbac.md`: Role, approval akun, route guard, dan kontrak `profiles`.
- `docs/auth-callback.md`: OAuth Google callback flow dan error handling.
- `docs/database.md`: Tabel utama, RLS, hak akses eksplisit (Explicit Grants), storage bucket, usage billing, dan catatan backup data.
- `docs/design-guidelines.md`: Prinsip visual dan UI yang harus dipakai untuk perubahan frontend.

## Operasional

- `docs/MONITORING_TOKEN_USAGE_BILLING.md`: Kontrak usage AI bulanan, billing Rupiah, pricing/kurs, quick-view modul, dan smoke test.
- `docs/SUPABASE_LOCAL_BACKUP.md`: Backup lokal Supabase database dan Storage.
- `docs/SIDAK_LOGIC_AND_SCORING.md`: Logika bisnis SIDAK — rumus skor, clean-session, ranking agent (Tim Gabungan/Tim Leader), dan forecast 3 bulan per agent berdasarkan konteks tahun+layanan.
- `docs/SIDAK_SCORING_GUARDRAILS.md`: Guardrail wajib sebelum mengubah scoring atau agregasi SIDAK.
- `docs/forecasting-sidak.md`: Evaluasi metode forecasting SIDAK (regresi linear, MA-3, WMA-3) dan rekomendasi pengembangan.
- `docs/LEADER_APPROVAL_ACCESS.md`: Leader approval-based data access untuk KTP dan SIDAK.
- `docs/qa_report_guidelines.md`: Panduan standar untuk pelaporan AI QA Analyzer (Path to Zero).
- `docs/TELEFUN_ASSESSMENT_CONTRACT.md`: Kontrak penilaian suara Telefun — trust boundary, skala nilai, parser kanonik.
- `docs/deployment.md`: Panduan deployment aplikasi.
- `docs/checklist-audit-trainers-superapp.md`: Checklist audit parity Next.js vs Vite.
- `docs/integration-tests.md`: PDKT Mailbox RPC integration tests (Docker + local Supabase).
- `docs/AUTH_KNOWN_ISSUE_PROFILE_SCHEMA_DRIFT.md`: Catatan isu schema drift profil auth.
- `apps/web/src/routes/ketik/lib/`: KETIK shared utilities (`message-utils.ts`, `pacing.ts`).

## Verifikasi Umum

- Jalankan `pnpm lint` untuk validasi lint cepat.
- Jalankan `pnpm test` untuk menjalankan seluruh test suite (1056+ API + 500+ web tests).
- Jalankan `pnpm test:fast` untuk test cepat (exclude .tsx, ~1-2 menit).
- Jalankan `pnpm audit --prod` untuk memantau advisory dependensi; overrides keamanan (brace-expansion, fast-uri, dompurify, protobufjs) terpusat di `pnpm-workspace.yaml` — update di sana, bukan di `package.json` app.
- Jalankan `pnpm test:core` untuk test kontrak kritis lintas modul (~30-60s). Daftar file yang digate diatur terpusat di [`scripts/test-core.json`](../scripts/test-core.json) (runner: `scripts/test-core.mjs`) — tambahkan test kritis baru ke daftar itu, bukan ke `package.json`.
- Jalankan `pnpm --filter @trainers/api test` untuk test API service saja.
- Jalankan `pnpm --filter @trainers/web test` untuk test frontend saja.
- Jalankan `pnpm build` untuk validasi build production.
- Jalankan `git diff --check` sebelum commit untuk memastikan tidak ada whitespace error.

### Test Tiering

| Tier | Command | Duration | Coverage |
|------|---------|----------|----------|
| Targeted | `pnpm test:targeted` | 10-30s | Changed files only (vitest --changed) |
| Core | `pnpm test:core` | 30-60s | Kontrak kritis lintas modul |
| Fast | `pnpm test:fast` | 1-2min | Seluruh unit test ringan (no .tsx) |
| Full | `pnpm test` | ~5min | Semua tests (unit + component rendering) |

> **Catatan:** Beberapa file dokumentasi legacy (`TELEFUN_OPERATIONAL_RUNBOOK.md`, `QA_SMOKE_TEST_VERSIONED_RULES.md`, `master-backlog.md`, known issues, dan changelog files) belum di-port dari `reference-repo/docs/`. Jika diperlukan, file-file tersebut dapat di-port dengan adaptasi ke arsitektur monorepo.
