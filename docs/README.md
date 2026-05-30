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
- `docs/modules.md`: Status fitur per modul: Dashboard, KETIK, PDKT, TELEFUN, Profiler/KTP, dan SIDAK.
- `docs/auth-rbac.md`: Role, approval akun, route guard, dan kontrak `profiles`.
- `docs/database.md`: Tabel utama, RLS, hak akses eksplisit (Explicit Grants), storage bucket, usage billing, dan catatan backup data.
- `docs/design-guidelines.md`: Prinsip visual dan UI yang harus dipakai untuk perubahan frontend.

## Operasional

- `docs/MONITORING_TOKEN_USAGE_BILLING.md`: Kontrak usage AI bulanan, billing Rupiah, pricing/kurs, quick-view modul, dan smoke test.
- `docs/SUPABASE_LOCAL_BACKUP.md`: Backup lokal Supabase database dan Storage.
- `docs/SIDAK_LOGIC_AND_SCORING.md`: Penjelasan logika bisnis SIDAK, rumus skor, clean-session, dan cara perhitungan.
- `docs/SIDAK_SCORING_GUARDRAILS.md`: Guardrail wajib sebelum mengubah scoring atau agregasi SIDAK.
- `docs/LEADER_APPROVAL_ACCESS.md`: Leader approval-based data access untuk KTP dan SIDAK.
- `docs/qa_report_guidelines.md`: Panduan standar untuk pelaporan AI QA Analyzer (Path to Zero).
- `docs/deployment.md`: Panduan deployment aplikasi.
- `docs/checklist-audit-trainers-superapp.md`: Checklist audit parity Next.js vs Vite.
- `docs/AUTH_KNOWN_ISSUE_PROFILE_SCHEMA_DRIFT.md`: Catatan isu schema drift profil auth.
- `apps/web/src/routes/ketik/lib/`: KETIK shared utilities (`message-utils.ts`, `pacing.ts`).

## Verifikasi Umum

- Jalankan `pnpm lint` untuk validasi lint cepat.
- Jalankan `pnpm test` untuk menjalankan seluruh test suite (475 API + 468 web = 943 tests).
- Jalankan `pnpm --filter @trainers/api test` untuk test API service saja.
- Jalankan `pnpm --filter @trainers/web test` untuk test frontend saja.
- Jalankan `pnpm build` untuk validasi build production.
- Jalankan `git diff --check` sebelum commit untuk memastikan tidak ada whitespace error.

> **Catatan:** Beberapa file dokumentasi legacy (`TELEFUN_OPERATIONAL_RUNBOOK.md`, `QA_SMOKE_TEST_VERSIONED_RULES.md`, `master-backlog.md`, known issues, dan changelog files) belum di-port dari `reference-repo/docs/`. Jika diperlukan, file-file tersebut dapat di-port dengan adaptasi ke arsitektur monorepo.
