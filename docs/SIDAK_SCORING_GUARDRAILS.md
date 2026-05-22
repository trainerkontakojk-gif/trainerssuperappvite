# SIDAK Scoring Guardrails

Dokumen ini dibuat untuk mencegah regresi SIDAK pada scoring, audited population, dan clean-session handling.

## Guardrails Wajib Saat Ubah SIDAK

### 1) Cache Key Harus Kontekstual

- Pastikan pemanggilan cache atau query indikator selalu membawa konteks `service_type` dan `period_id` saat konteks periode aktif.

Checklist review:

- [ ] Tidak ada pola cache indikator global statis yang dipakai lintas periode.
- [ ] Endpoint/dashboard/ranking yang butuh versioned indicators mengirim `service_type` + `period_id`.

### 2) Scoring Harus Kompatibel Versioned + Legacy

- Di fungsi scoring, pemetaan indikator wajib kompatibel:
  - gunakan `COALESCE(rule_indicator_id, indicator_id)` untuk membaca data temuan campuran.
- Saat `rule_version_id` tersedia, metadata indikator dan bobot harus diambil dari `qa_service_rule_indicators`.
- Jika `rule_version_id` tidak ada, fallback aman ke `qa_indicators` tetap dipertahankan untuk data legacy.

Checklist review:

- [ ] Scoring masih mendukung `rule_indicator_id` + fallback `indicator_id`.
- [ ] Join/lookup indikator tidak hard-code ke tabel legacy saja.

### 3) Clean Session Harus Pakai 3 Bucket Data

Jangan pakai satu filter global `is_phantom_padding = false` untuk semua jalur SIDAK. Gunakan tiga bucket berikut:

- `auditPresenceRows`: semua row agent-period-service, termasuk phantom-only clean session.
- `scoreRows`: pakai row real jika ada; jika satu agent-period-service hanya punya phantom, pakai phantom agar skor periode tetap `100`.
- `findingRows`: hanya row real yang countable (`nilai < 3` atau ada catatan).

Aturan turunannya:

- Phantom-only clean session adalah audit valid untuk `totalAgents`, `zeroErrorRate`, `complianceRate`, `avgAgentScore`, dan ranking audited agents.
- Phantom tidak boleh menambah `totalDefects`, `findingsCount`, pareto, donut, `hasCritical`, atau defect sorting.
- Jika satu agent-period-service punya row real + phantom sekaligus, scoring dan defect aggregation wajib identik dengan memakai row real saja.

Checklist review:

- [ ] Tidak ada filter phantom global yang dijalankan sebelum data dipartisi ke `auditPresenceRows/scoreRows/findingRows`.
- [ ] `totalAgents`, `zeroErrorRate`, `complianceRate`, dan `avgAgentScore` memakai populasi audit presence.
- [ ] `totalDefects`, `findingsCount`, pareto, donut, dan ranking defect hanya memakai `findingRows`.
- [ ] Mixed real + phantom tetap menghasilkan skor/defect yang sama dengan row real saja.

Catatan khusus report data:

- `/sidak/reports-data` adalah view tabel/export temuan real, bukan sumber scoring atau audit-presence.
- Jalur ini boleh mengecualikan `is_phantom_padding = true` di query presentation layer, selama jalur dashboard, ranking, detail agent, dan scoring tetap memakai bucket audit-presence di atas.

### 4) Service Inference Harus Lewat Helper Tunggal

- Inferensi default service dari `tim` wajib menggunakan helper terpusat.
- Service aktif di input SIDAK wajib dihitung agar override manual, inferensi tim, dan fallback tidak saling menimpa secara stale.
- Helper menangani: trim + lowercase, passthrough service code langsung, alias tim, dan fallback akhir.

Checklist review:

- [ ] Tidak ada chain `includes()` terpisah atau exact-match lookup di luar helper.
- [ ] Prefetch temuan di input page membawa argumen `serviceType`.
- [ ] Saat agent berubah di input page, override service lama dan form state di-reset.

### 5) Ranking Harus Fetch Lengkap Dan Dipartisi Per Agent

- Jalur ranking yang membaca `qa_temuan` langsung tidak boleh bergantung pada satu page default PostgREST.
- Jika ranking memakai row-level fetch dari `qa_temuan`, pembacaan wajib di-paginate sampai habis.
- Grouping untuk audited population ranking minimal harus memisahkan `agent + period`.

Checklist review:

- [ ] Ranking tidak rawan truncation 1000 row.
- [ ] Key partisi ranking tidak menggabungkan beberapa agent dalam satu period bucket.
- [ ] Agent phantom-only tetap bisa muncul di ranking dengan `defects = 0` dan `score = 100`.

### 6) Urutan Parameter Dashboard Harus Eksplisit

- Panel tren kualitas tidak boleh mengandalkan urutan payload mentah.
- Dataset parameter non-total wajib diurutkan berdasarkan total temuan terbesar ke terkecil.
- `Total Temuan` tetap menjadi seri pertama jika ditampilkan.

Checklist review:

- [ ] Toggle parameter dashboard memakai dataset yang sudah di-sort.
- [ ] Chart parameter dashboard memakai urutan yang sama dengan toggle.

### 7) Historical Agent Input Harus Lewat Toggle All-Data

- Default `/sidak/agents` dan `/sidak/input` tetap filtered.
- Kebutuhan input periode lama untuk agent yang sudah promosi/pindah jabatan wajib memakai toggle `Tampilkan Data Keseluruhan`.
- Tombol `INPUT AUDIT` dari detail agent wajib menuju `/sidak/input`.

Checklist review:

- [ ] Agent excluded membawa `showAll=1` dari detail agent ke input page.
- [ ] Toggle all-data di input mereset folder, agent, period, temuan, dan form state.

### 8) Validasi Integritas Pemetaan Parameter & Excel Upload

- **Validasi Unggah Excel:** Seluruh baris temuan yang diunggah wajib memiliki pemetaan indikator aktif yang valid. Jika ada baris dengan `indicator_id` yang tidak terdaftar, pengunggahan harus diblokir (_fail-fast transaction rollback_).
- **Draft Parameter Baru:** Saat menambahkan parameter baru dalam mode draft, sistem otomatis menjamin pembuatan dan pemetaan legacy indicator yang sah.
- **Pencegahan Error FK:** Gunakan helper sebelum penyimpanan massal untuk menyinkronkan ID.

Checklist review:

- [ ] Pengunggahan Excel langsung memvalidasi keberadaan `indicator_id` pada rule aktif.
- [ ] Tidak ada baris yang lolos dengan pemetaan null saat transaksi disimpan.
- [ ] Pesan kesalahan Foreign Key dinormalisasi menjadi pesan yang ramah bagi pengguna.

## Deployment Checklist

1. Apply migration terbaru SIDAK dari `supabase/migrations/`.
2. Jalankan `pnpm test` untuk validasi test suite.
3. Verifikasi manual dashboard untuk 2 periode berbeda agar skor/tren tidak collapse.
4. Verifikasi minimal 1 agent dengan bulan phantom-only agar ranking tetap menampilkan audited session `100` tanpa menaikkan defect count.

## Minimal Verification Setelah Perubahan

- `pnpm lint`
- `pnpm test`
- `pnpm --filter @trainers/api test`
- Smoke UI: `/sidak/settings`, `/sidak/input`, `/sidak/dashboard`, `/sidak/ranking`, `/sidak/reports-data`
- Fokus smoke tambahan:
  - ranking tetap lengkap saat dataset besar
  - toggle parameter dashboard mengikuti urutan total temuan
  - toggle `Tampilkan Data Keseluruhan` di `/sidak/agents` dan `/sidak/input`
  - tombol `INPUT AUDIT` dari detail agent menuju `/sidak/input`
  - report data tidak menampilkan phantom padding di tabel/export
