# Phase 97: PDKT Natural Name, Clues, and AI Image Generation Warnings

## Progress Summary

Perbaikan bug kritis pada modul PDKT terkait kebocoran nama identitas di email body, pengenalan diri yang tidak natural (hardcoded fallback), dan kegagalan silent saat generate gambar AI:

1.  **Identity Name Leakage Fix**:
    *   Memastikan header sender name (misalnya `Black Cat`) tidak bocor ke badan email (body) jika user menentukan nama berbeda di `bodyName` (misalnya `Susanto`).
    *   Jika pattern penyebutan adalah `none`, seluruh kemunculan nama dibersihkan secara penuh baik di subject maupun body.
    *   Metode pembersihan memprioritaskan penyebutan `bodyName` jika diatur, dan membersihkan header `name` agar tidak bocor.

2.  **Placement-Aware Natural Context Clues**:
    *   Menghilangkan fallback teks perkenalan diri generik ("Oya, saya Budi...") yang terlalu mudah dideteksi oleh AI/renderer sebagai pola kaku.
    *   Mengimplementasikan `NAME_CLUE_TEMPLATES` yang berisi 11 variasi teks natural berkonteks (terkait dokumen, SLIK OJK, billing tagihan, dll) terbagi berdasarkan penempatan `upfront` (awal email) dan `middle` (tengah email).
    *   Penentuan template menggunakan indeks deterministik berbasis *seed text* dari skenario, sehingga hasil simulasi konsisten namun variatif.

3.  **Structured AI Image Generation Diagnostics**:
    *   Memperbaiki bug image generation yang gagal secara silent. Jika model gagal membuat gambar, sistem tidak lagi sekadar mengabaikannya dengan `attachmentSource: "none"`.
    *   Fungsi `generatePdktScenarioImages` sekarang mengembalikan objek hasil yang terstruktur beserta field `warning` dan `diagnostics`.
    *   Field `attachmentWarning` ditransmisikan dari backend ke frontend melalui type contract schema `emailMessageSchema` yang diperluas.
    *   Di frontend, warning ditampilkan sebagai AlertCard yang kompak dan selaras dengan design system di sebelah area attachment kosong.

### File Affected

*   `packages/types/src/pdkt.ts`: Penambahan field opsional `attachmentWarning` pada Zod schema `emailMessageSchema`.
*   `apps/api/src/services/pdkt-email-policy.ts`: Implementasi helper pembersihan nama, template penempatan clue natural deterministik, dan pengetatan validasi compliance.
*   `apps/api/src/services/pdkt/image-generation.ts`: Peningkatan diagnostic reporting saat terjadi kegagalan/fallback image generation.
*   `apps/api/src/services/pdkt/session-service.ts`: Propagasi `attachmentWarning` ke pesan inbound inisialisasi sesi.
*   `apps/web/src/routes/pdkt/components/EmailDetailPane.tsx`: Integrasi render Alert Card peringatan kegagalan generate gambar jika ada warning.
*   `apps/web/src/__tests__/pdkt-ai-image-rendering.test.tsx`: Penambahan unit/rendering tests untuk Alert Card peringatan di UI.
*   `apps/api/src/__tests__/pdkt-email-policy.test.ts`: Penambahan characterization/compliance tests untuk pembersihan nama dan penempatan natural clue.
*   `apps/api/src/__tests__/pdkt-image-generation.test.ts`: Penambahan tests untuk fallback model diagnostics dan assertion warning.
*   `apps/api/src/__tests__/pdkt-session-create-route.test.ts`: Penambahan route-level regression coverage untuk `bodyName` dan `middle` mention pattern.

### Testing & Verification

*   **API Tests**: Seluruh unit & E2E tests untuk service policy, image generation, dan session creation routes berhasil (PASS).
*   **Web Tests**: Komponen rendering Alert Card diuji secara fungsional menggunakan react-testing-library (PASS).
*   **Typecheck**: Integrasi backend hono RPC dan frontend type-safety lulus tanpa error.
