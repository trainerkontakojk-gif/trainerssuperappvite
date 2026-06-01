# Phase 95: PDKT AI Image Generation Remediation

## Progress Summary

Perbaikan modul PDKT agar toggle `AI Aktif` benar-benar memicu workflow image generation yang relevan dengan keluhan konsumen. Sebelumnya, toggle ini hanya tersimpan sebagai preference tanpa pernah dijalankan.

### Key Changes

1.  **Backend image-generation service**:
    *   Dibuat modul baru `apps/api/src/services/pdkt/image-generation.ts` yang menangani provider-agnostic image generation.
    *   Mendukung fallback otomatis ke model image yang didukung jika model simulasi aktif tidak memiliki kapabilitas image generation.
2.  **Multimodal Wrapper Update**:
    *   `apps/api/src/lib/gemini.ts`: Ditambahkan parser untuk `inlineData` agar bisa mengekstrak gambar dari model (misal Imagen 3).
    *   `apps/api/src/lib/openrouter.ts`: Ditambahkan dukungan `modalities: ["image"]` dan parser `message.images`.
3.  **Model Capability Registry**:
    *   `packages/types/src/ai-models.ts`: Ditambahkan metadata `capabilities` (`supportsImage`, `imageGenerationMode`) untuk setiap model di registry.
    *   Tagging model Gemini dan OpenRouter yang mendukung multimodal output.
4.  **Backend Session Orchestration**:
    *   `apps/api/src/services/pdkt-service.ts`: Refactor `initializeEmailSession` untuk mengorkestrasi pipeline: `generate email -> resolve attachments policy -> generate AI images -> final message`.
    *   **Attachment Policy**: Manual Attachments (User Upload) > AI Generated Images > None.
    *   Graceful fallback: Jika image generation gagal, sesi tetap lanjut dengan email saja tanpa menggagalkan simulasi.
5.  **Simplified Frontend Flow**:
    *   `apps/api/src/routes/pdkt.ts`: Ditambahkan endpoint baru `POST /session/init` yang mengembalikan pesan inbound final siap pakai.
    *   `apps/web/src/routes/pdkt/simulation.tsx`: Disederhanakan untuk mengonsumsi endpoint inisialisasi backend, mengurangi kerumitan logic di sisi client.
6.  **UI/UX Improvements**:
    *   `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx`: Ditambahkan microcopy penjelas di bawah toggle `AI Aktif` mengenai prioritas lampiran.

### File Affected

*   `packages/types/src/ai-models.ts`: Capability metadata & constants.
*   `packages/types/src/pdkt.ts`: `attachmentSource` metadata & schema updates.
*   `apps/api/src/lib/ai-models.ts`: Image generation helpers & exports.
*   `apps/api/src/lib/gemini.ts`: Multimodal output support.
*   `apps/api/src/lib/openrouter.ts`: Image modality support.
*   `apps/api/src/services/pdkt/image-generation.ts`: New decoupled image service.
*   `apps/api/src/services/pdkt-service.ts`: Orchestration refactor.
*   `apps/api/src/routes/pdkt.ts`: New unified init endpoint.
*   `apps/web/src/routes/pdkt/simulation.tsx`: Simplified start flow.
*   `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx`: Microcopy.

### Testing & Verification

*   **API Tests**: `apps/api/src/__tests__/pdkt-image-generation.test.ts` (4 tests PASS).
    *   Verifikasi attachment policy (Manual > AI).
    *   Verifikasi toggle off (No AI images).
    *   Verifikasi failure safety (Session doesn't fail if image fails).
*   **Web Tests**: `apps/web/src/__tests__/pdkt-ai-image-rendering.test.tsx` (1 test PASS).
    *   Verifikasi rendering lampiran AI di `EmailDetailPane`.
*   **Typecheck**: `tsc --noEmit` PASS di API & Web.

## Documentation Note

**Kebijakan Fallback Model**:
Jika user memilih model text-only, backend secara otomatis akan menggunakan `gemini-3.1-flash-lite` (atau model fallback yang dikonfigurasi) untuk image generation guna memastikan toggle `AI Aktif` tetap memberikan hasil visual kepada user.
