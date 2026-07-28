# Rebuild Log: PDKT Evaluation Invalid Output Retry

## Deskripsi Bug Fix

Memperbaiki kegagalan evaluasi PDKT ketika provider AI berhasil mengembalikan respons, tetapi payload JSON tidak bisa dinormalisasi oleh backend. Sebelum fix ini, respons invalid langsung dianggap final failure dan worker tidak mencoba ulang walaupun budget retry transient masih tersedia.

## Masalah Utama

- Respons Gemini/OpenAI kadang valid sebagai request sukses, tetapi isi JSON tidak lolos normalisasi backend.
- Kondisi ini sebelumnya tidak memakai retry budget yang sudah ada.
- Hasilnya, evaluasi gagal walaupun respons berikutnya dari model bisa valid.

## Solusi Implementasi

### 1. Service Retry Retryable Invalid Output
- `apps/api/src/services/pdkt/evaluation-service.ts`
  - Menambahkan marker error lokal untuk membedakan invalid AI output dari failure provider biasa.
  - Normalisasi JSON yang gagal parse atau gagal memenuhi schema evaluasi kini dianggap retryable.
  - Retry tetap dibatasi oleh budget delay yang sudah ada.
  - Error final tetap menggunakan pesan yang sama:
    `Respons evaluasi AI tidak sesuai format yang diharapkan.`
  - Non-transient provider failure tidak ikut diperluas menjadi retryable.

### 2. Regression Tests
- `apps/api/src/__tests__/pdkt-evaluation-prompt.test.ts`
  - Menambah cakupan untuk:
    - invalid output pertama lalu valid output berikutnya berhasil,
    - output invalid berulang gagal setelah retry budget habis,
    - teks model yang tidak bisa diparse tetap gagal dengan error yang sama,
    - provider failure non-transient tidak diretry.

## Verifikasi

- Focused Vitest untuk file PDKT evaluation prompt
- API TypeScript no-emit check

## Rollback Plan

- Hapus marker error lokal dan kondisi retry khusus invalid output di `evaluation-service.ts`.
- Kembalikan ekspektasi test ke perilaku single-attempt lama jika rollback diperlukan.
