# TNA (Training Needs Analysis) — Fase 4: Akses Leader

- **Status:** DRAF rev. 1 — keputusan K25–K31 menunggu Fajar. Belum ada kode, migrasi, atau test.
- **Tanggal rencana:** 2026-11-04.
- **Baseline saat perencanaan:** `1b366ee9` (`main`). Mulai dari `main` terbaru di branch baru, mis. `feat/tna-phase-4`.
- **Fondasi:** Fase 1 D8 (fondasi akses leader), Fase 2, dan idealnya Fase 3 ([`tna-phase-3.md`](tna-phase-3.md)) karena K30 bergantung pada tabel latihan. Fase 4 bisa jalan tanpa Fase 3 bila K30 = tidak.
- **Executor:** Codex atau agent lain, satu task per sesi. T1 (RLS/guard) sebaiknya Claude.
- **Risk lane:** **Lane D**: RLS, kapabilitas baru, scope data, kontrak API publik, antarmuka.

## 0. Wajib dibaca executor sebelum mulai

1. `AGENTS.md` → `docs/AGENT_WORKFLOW.md`; skill `trainers-superapp-tdd`, `supabase-migration` (T1), `ui-ux-pro-max`/`impeccable` (T4), `thermo-nuclear` (T5). Bukan `superpowers:*`.
2. `docs/auth-rbac.md` (scope leader, persetujuan akses), `apps/api/src/services/access/scope.ts`, `leader-scope.ts`, migrasi `004_admin_core.sql` (`leader_access_requests`) dan `20260618102000_add_get_leader_scope_snapshot_rpc.sql`.
3. `packages/types/src/access.ts`, `apps/web/e2e/helpers/accessMatrix.ts`, `apps/web/e2e/access-matrix-api.spec.ts`.
4. Fase 1 D8 dan semua bagian akses di rencana Fase 1–3.

## Requirement

### Konteks bisnis

Leader memimpin tim agent dan perlu tahu kebutuhan training timnya serta hasilnya. Fase 1 sengaja menutup TNA untuk leader dan mencatat empat pertanyaan yang wajib dijawab dulu (D8). Fase 4 menjawabnya dan membuka TNA untuk leader **sebatas timnya**.

### Fakta kode yang membentuk rencana ini

- `resolveDataScope(actor, module)` hanya menerima `"sidak" | "ktp"`. Leader mendapat `{ kind: "team", pesertaIds, services }` dari permintaan akses yang disetujui (`leader_access_requests.module` CHECK `ktp | sidak | all`).
- Mesin metrik TNA (`metrics.ts`) sudah menerima `DataScope` tetapi hanya dipanggil dengan `{ kind: "all" }`.
- Semua policy SELECT `tna_*` dan `efek_*` memakai `is_admin_or_trainer()`. Kapabilitas `tna.read`/`tna.write` hanya admin + trainer.
- Rencana menyimpan **metrik populasi** (`validation_snapshot`, `baseline_snapshot`, `evaluation_snapshot`) atas semua agent layanan. Angka itu memuat data tim lain.
- Satu rencana bisa berisi peserta dari beberapa tim.

## 1. Keputusan (menunggu Fajar)

| #   | Aspek                     | Usulan (rekomendasi)                                                                                                                                                                                                                                                                                                           | Alternatif                                                                                    | Status |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------ |
| K25 | Sumber scope              | **Pakai persetujuan akses SIDAK** (`module = 'sidak'` atau `'all'`). TNA membaca data SIDAK, jadi leader yang boleh melihat SIDAK timnya otomatis boleh melihat TNA timnya. Tidak ada alur persetujuan baru.                                                                                                                   | Modul akses baru `tna` (ubah CHECK, alur persetujuan, UI admin).                              | Usulan |
| K26 | Metrik populasi           | Leader **tidak** melihat angka populasi lintas tim. Di `/tna` dan drill-down, metrik dihitung ulang dengan `DataScope` tim (label "Tim Anda"). Di detail rencana, snapshot populasi disembunyikan; leader hanya melihat target, verdict, dan baris peserta timnya.                                                             | Leader melihat angka populasi utuh (bocor angka tim lain); atau leader hanya melihat rencana. | Usulan |
| K27 | Rencana yang terlihat     | Rencana terlihat bila **minimal satu** peserta ada di scope leader. Baris peserta lain disaring di server; jumlah total peserta tetap ditampilkan sebagai angka.                                                                                                                                                               | Hanya rencana yang semua pesertanya di scope leader.                                          | Usulan |
| K28 | Hak tulis leader          | **Baca saja** di Fase 4. Validasi kebutuhan, rencana, aktivasi, evaluasi, dan pembatalan tetap admin + trainer.                                                                                                                                                                                                                | Leader boleh membuat kebutuhan/rencana untuk timnya (butuh aturan kepemilikan dan konflik).   | Usulan |
| K29 | Kapabilitas               | Kapabilitas baru **`tna.team.read`** untuk leader. `tna.read` tetap admin + trainer dengan arti "lihat semua". Route memilih jalur baca berdasarkan kapabilitas, bukan dengan menambah leader ke `tna.read`.                                                                                                                   | Tambahkan leader ke `tna.read` dan cabangkan berdasarkan scope.                               | Usulan |
| K30 | Tugas latihan untuk agent | Bila Fase 3 sudah jalan: agent melihat **tugas latihannya sendiri** (modul, target, progres) di landing modul simulasi lewat `GET /tna/me/practice` (kapabilitas `tna.practice.self`, scope `self`). Agent tidak melihat metrik QA TNA.                                                                                        | Agent tetap tanpa akses TNA.                                                                  | Usulan |
| K31 | Jalur baca                | **RLS per scope** untuk leader: policy SELECT tambahan memakai helper `SECURITY DEFINER` di schema publik yang mengembalikan `peserta_id` scope leader untuk `auth.uid()` (dari tabel persetujuan yang sama dengan `get_leader_scope_snapshot`). Metrik SIDAK tetap dibaca dengan JWT leader dan RLS SIDAK yang sudah berlaku. | Backend membaca dengan service-role lalu menyaring (melanggar K6 untuk pembacaan).            | Usulan |

### Hasil Fase 4

1. Leader yang disetujui untuk SIDAK melihat entri TNA di rail/drawer dan halaman `/tna` dengan metrik tim.
2. Leader melihat daftar dan detail rencana yang menyangkut timnya (K27), tanpa angka populasi (K26), tanpa tombol tulis.
3. Leader tanpa persetujuan atau dengan scope kosong melihat state "Akses tim belum disetujui" / "Tim Anda belum punya peserta", bukan error.
4. Bila K30 disetujui: agent melihat tugas latihannya di landing KETIK/PDKT/Telefun.
5. Admin/trainer tidak berubah.

### Di luar cakupan Fase 4

Hak tulis leader, modul akses `tna` terpisah, akses EFEK untuk leader, notifikasi, perubahan scope SIDAK yang ada.

## 2. Desain

### D20. Scope

- `resolveDataScope` menerima `"tna"` dan memetakannya ke persetujuan `sidak`/`all` (K25), atau T0 memutuskan cukup memanggil dengan `"sidak"` dari route TNA (lebih sedikit perubahan; catat pilihan).
- Fungsi metrik/drill-down meneruskan scope ke `metrics.ts`. `scope.kind = "team"` memfilter agent dan layanan (`services`). Layanan di luar scope leader → 403 dengan pesan manusiawi.

### D21. RLS (migrasi `<timestamp>_tna_phase4_leader_read.sql` + rollback)

- Helper `public.tna_leader_scope_peserta_ids()` `STABLE SECURITY DEFINER`, `SET search_path = public`, membaca persetujuan untuk `auth.uid()` saja (tanpa argumen user). Tidak memanggil `set_config`. T0 memastikan helper serupa belum ada dan polanya tidak memicu bug crash (K6).
- Policy SELECT tambahan untuk role `leader`:
  - `tna_plan_participants`: baris dengan `peserta_id` di scope.
  - `tna_plans`: ada peserta di scope (`EXISTS`).
  - `tna_needs`: punya rencana yang terlihat.
  - `tna_programs`, `tna_plan_practice_targets`: mengikuti rencana yang terlihat / katalog aktif.
- Kolom snapshot populasi tetap ada di baris yang terlihat lewat RLS, jadi **backend wajib** membuang field populasi untuk leader (K26), dan spec membuktikan PostgREST langsung tidak dipakai klien web. Bila Fajar menginginkan perlindungan di DB juga → view terpisah (STOP S20).

### D22. API

| Method & path                    | Kapabilitas                     | Perilaku leader                                                                    |
| -------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /tna/parameters`, `/detail` | `tna.read` atau `tna.team.read` | Metrik scope tim, `scope_label: "team"`; contoh tiket hanya agent tim.             |
| `GET /tna/needs`, `/needs/:id`   | sama                            | Hanya kebutuhan dengan rencana terlihat; `validation_snapshot` dibuang.            |
| `GET /tna/plans`, `/plans/:id`   | sama                            | K27; snapshot populasi, pembanding, dan narasi populasi dibuang; peserta disaring. |
| Semua mutasi                     | `tna.write`                     | Tetap 403 untuk leader.                                                            |
| `GET /tna/me/practice` (K30)     | `tna.practice.self`             | Agent: tugas dan progres sendiri dari rencana `aktif`/`evaluasi`.                  |

Tipe respons leader memakai bentuk yang sama dengan field opsional `null` + `visibility: "team"`, supaya UI tidak bercabang di banyak tempat.

### D23. Antarmuka

- `APP_MODULES` entri TNA memakai kapabilitas "salah satu dari" `tna.read`/`tna.team.read` (cek dukungan di `nav-config.ts` dan route guard).
- Leader: badge "Tim Anda" di filter, tombol tulis disembunyikan (bukan disabled), detail rencana tanpa kartu populasi/pembanding, catatan "Angka populasi hanya untuk trainer".
- Tab EFEK tetap tersembunyi untuk leader.
- K30: kartu "Tugas latihan dari trainer" di landing modul simulasi; kosong → tidak tampil.

## 3. Task

| Task | Isi                                                                                                                                                                                                                                                  | Bukti selesai                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| T0   | **Discovery read-only**: cara RPC scope leader dijaga, helper RLS yang ada, semua consumer `is_admin_or_trainer()` di `tna_*`, cara nav mendukung kapabilitas ganda, field populasi di setiap respons TNA.                                           | `plans/markdown/tna-phase-4-t0-report.md`; STOP bila S20–S22. |
| T1   | **RLS + helper + rollback** (D21). RED-first real backend: leader melihat hanya rencana timnya lewat PostgREST, leader tanpa persetujuan melihat nol baris, agent nol baris, admin/trainer tetap semua, mutasi tetap ditolak, DB sehat.              | RED → GREEN; replay dan rollback lokal bersih.                |
| T2   | **Scope + API** (D20, D22) + kapabilitas `tna.team.read` (dan `tna.practice.self` bila K30). RED-first: metrik tim ≠ populasi pada fixture dua tim, field populasi tidak ada di respons leader, layanan di luar scope 403, matriks akses diperbarui. | GREEN; regresi semua spec API TNA tetap hijau.                |
| T3   | **K30 (opsional)**: `GET /tna/me/practice` dan kartu landing. Lewati bila K30 ditolak atau Fase 3 belum ada.                                                                                                                                         | GREEN atau dicatat "dilewati".                                |
| T4   | **UI** (D23) dengan `ui-ux-pro-max`/`impeccable`. Spec browser hermetic leader: nav terlihat, halaman tim, detail tanpa populasi, tidak ada tombol tulis, state belum disetujui/scope kosong; desktop + mobile.                                      | GREEN; screenshot.                                            |
| T5   | **Review & dokumentasi**: `thermo-nuclear`, sinkron `docs/{modules,database,auth-rbac}.md`, gate serial lengkap, `graphify update .`.                                                                                                                | `plans/markdown/tna-phase-4-t5-report.md`.                    |

## 4. Strategi E2E

- Real backend loopback dengan fixture dua tim, satu leader disetujui, satu leader pending, satu agent terhubung. Assertion utama: angka dan baris tim lain **tidak pernah** muncul di respons leader.
- Hermetic browser untuk UI. Tidak ada unit test baru tanpa izin Fajar.

## 5. Rilis

- Migrasi produksi hanya dengan izin Fajar (satu file + `migration repair`). Migrasi menambah policy, tidak mengubah policy admin/trainer.
- Deploy API sebelum mengumumkan ke leader. Rollback: deploy sebelumnya + rollback policy/helper.

## 6. STOP conditions (berhenti dan tanya Fajar)

- **S20:** Menyembunyikan angka populasi hanya di backend dinilai tidak cukup dan butuh view/kolom terpisah di DB.
- **S21:** Scope leader tidak bisa diturunkan di RLS tanpa memanggil fungsi service-role atau tanpa menerima user id dari argumen.
- **S22:** Menambah policy membuat pembacaan admin/trainer berubah, atau memicu `signal 11`/`PGRST001`.
- **S23:** Muncul kebutuhan hak tulis leader, akses EFEK leader, atau modul akses `tna` terpisah.
- STOP Fase 1–3 tetap berlaku.
