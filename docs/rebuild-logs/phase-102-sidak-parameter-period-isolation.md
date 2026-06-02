# Phase 102 - SIDAK Parameter Period Isolation Rebuild Log

## Overview

Di Phase 102, kita memperbaiki dan mengisolasi parameter/bobot SIDAK agar berjalan secara period-aware. Perbaikan mencakup endpoint penghapusan draft parameter QA yang sebelumnya missing dari backend Hono, perbaikan logic superseding saat publish, pemakaian rule resolver period-aware di input, validasi, save, dan kalkulasi dashboard/summary, serta perbaikan UI agar versi/periode terbaru ditampilkan di atas dengan keterangan rentang efektif yang tepat.

---

## Masalah & Solusi

### 1. Missing Delete Draft Endpoint
- **Masalah:** Tombol `Hapus Draft` di frontend memanggil `DELETE /api/v1/sidak/rule-versions/:id`, namun di backend endpoint tersebut belum dibuat sehingga user menerima error `Route DELETE ... not found`.
- **Solusi:** Menambahkan `deleteRuleVersionDraft(id)` di service dan mendaftarkan route `DELETE /rule-versions/:id` yang dibatasi hanya untuk role `admin` dan `trainer`. Endpoint ini memastikan hanya status `draft` yang dapat didelete (status `published`/`superseded` ditolak dengan return code 400).

### 2. Period Isolation & Superseding Scope
- **Masalah:** Sebelumnya logic publish men-supersede semua status `published` dari service type yang sama secara global. Hal ini menyebabkan periode lama (seperti Januari) ikut kehilangan status published aktifnya saat versi baru (seperti Mei) dipublish.
- **Solusi:** Membatasi scope supersede saat publish hanya pada target `effective_period_id` yang sama. published Januari tetap published meskipun versi Mei dipublish.

### 3. Canonical Rule Resolver
- **Masalah:** Penentuan rule version aktif menggunakan logic statis `resolveActivePublishedRuleVersion` yang hanya mengambil status `published` paling baru secara global, sehingga data historis (Januari-April) bisa terpengaruh oleh bobot baru Mei.
- **Solusi:** Membuat `resolveEffectiveRuleVersionForPeriod(serviceType, periodId)` yang mencari rule version ter-published yang `effective_period <= target period` secara kronologis.

### 4. Dashboard & Summary Weight Isolation
- **Masalah:** Proses refreshing summary dan kalkulasi dashboard raw menggunakan tabel global `qa_service_weights`, yang menyebabkan perubahan bobot di bulan baru ikut mengubah nilai historis jika summary direfresh.
- **Solusi:** Menggunakan snapshot bobot/indikator dari `qa_service_rule_versions` jika tersedia untuk periode tersebut. Di `getDashboardData()`, kombinasi unique `(service_type, period_id)` di-resolve dan di-cache secara konkuren sebelum loop agen untuk menjamin kecepatan dan keakuratan kalkulasi multi-period.

### 5. UI Newest-First and Clarified Copy
- **Masalah:** Timeline versi dan dropdown period di UI tidak tegas newest-first, dan copy masa berlaku statis ("dan seterusnya").
- **Solusi:** Mengurutkan versi di backend dengan mengurutkan target periode terbaru di atas. Di UI, dropdown target periode diurutkan newest-first secara in-memory, dan warning copy diubah menjadi: *"Setelah dipublish, rule ini tidak dapat diubah lagi (Immutable). Hanya versi published di periode target yang sama yang akan digantikan."*

---

## Verifikasi & Pengujian

Seluruh suite pengujian API dan frontend telah dijalankan dan lulus.

### 1. Test Service (`sidak-service.test.ts`)
- Memperbaiki helper mock `pendingResolve` agar bersifat table-aware dan tidak bergantung pada counter urutan call (`callCount++`) yang rentan terhadap race condition di eksekusi konkuren `Promise.all`.
- Semua 551 pengujian backend lulus secara stabil.

### 2. Test Frontend Settings (`sidak-settings-parity.test.tsx`)
- Memperbarui ekspektasi dialog konfirmasi penghapusan agar sesuai dengan copy dinamis yang baru: `Hapus draft v2 untuk Call efektif Mei 2026? Versi published tidak akan berubah.`.
- Semua pengujian frontend settings lulus secara stabil.
