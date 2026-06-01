# Phase 95: PDKT AI Image Generation Remediation & Robust JSON Parsing

## Progress Summary

Perbaikan modul PDKT agar toggle `AI Aktif` benar-benar memicu workflow image generation yang relevan dengan keluhan konsumen. Selain itu, diimplementasikan logika robust AI JSON parsing untuk menangani respons model yang mengandung teks tambahan atau multiple JSON blocks, yang sebelumnya menyebabkan `SyntaxError`.

### Key Changes

1.  **Robust AI JSON Parsing Logic**:
    *   Dibuat library baru `apps/api/src/lib/ai-json.ts` yang mengimplementasikan pencarian brace `{}` secara iteratif untuk menemukan objek JSON valid.
    *   Menggantikan metode parsing fragil (regex greedy) di PDKT, KETIK, SIDAK, dan Telefun.
    *   Mampu menangani respons model seperti: `Tentu, berikut JSON-nya: { ... } [Penjelasan Tambahan]`.

2.  **Backend image-generation service**:
    *   Dibuat modul baru `apps/api/src/services/pdkt/image-generation.ts`.
    *   Mendukung fallback otomatis ke model image yang didukung jika model simulasi aktif tidak memiliki kapabilitas image generation.

3.  **Multimodal Wrapper Update**:
    *   `apps/api/src/lib/gemini.ts`: Ditambahkan parser untuk `inlineData` (multimodal output).
    *   `apps/api/src/lib/openrouter.ts`: Ditambahkan dukungan `modalities: ["image"]`.

4.  **Model Capability Registry**:
    *   `packages/types/src/ai-models.ts`: Ditambahkan metadata `capabilities` untuk setiap model.

5.  **Backend Session Orchestration**:
    *   `apps/api/src/services/pdkt-service.ts`: Refactor `initializeEmailSession` untuk orkestrasi backend-side.
    *   `apps/api/src/services/pdkt/mailbox-session.ts`: helper baru untuk create+persist mailbox session agar `pdkt-service.ts` tetap di bawah 1k baris.
    *   **Attachment Policy**: Manual Attachments > AI Generated Images > None.
    *   `apps/api/src/services/pdkt/image-generation.ts`: normalisasi attachment hasil AI dengan batas jumlah dan guard ukuran data URI.

6.  **Simplified Frontend Flow**:
    *   `apps/api/src/routes/pdkt.ts`: Endpoint baru `POST /session/create` memegang boundary persist final.
    *   `apps/web/src/routes/pdkt/simulation.tsx`: Client-side logic disederhanakan menjadi satu panggilan create session.

### File Affected

*   `apps/api/src/lib/ai-json.ts`: New robust parser utility.
*   `packages/types/src/ai-models.ts`: Capability metadata.
*   `apps/api/src/services/pdkt-service.ts`: Orchestration & parser utilities.
*   `apps/api/src/services/pdkt/mailbox-session.ts`: boundary create+persist mailbox session.
*   `apps/api/src/services/pdkt/image-generation.ts`: image provider orchestration and attachment normalization.
*   `apps/api/src/services/ketik/shared-utils.ts`: Robust parser adoption.
*   `apps/api/src/services/sidak/ai-report-service.ts`: Robust report parsing.
*   `apps/api/src/lib/telefun-analysis.ts`: Robust analysis parsing.
*   `apps/api/src/routes/pdkt.ts`: Endpoint `/session/create`.
*   `apps/web/src/routes/pdkt/simulation.tsx`: Start flow simplification.
*   `apps/web/src/routes/pdkt/components/settings/SettingsPrimitives.tsx`: Shared settings UI primitives.
*   `packages/types/src/ai-models.ts`: TEXT_MODELS / IMAGE_GENERATION_MODELS pre-filtered arrays.

### Testing & Verification

*   **PDKT Tests**: suite targeted API/Web PASS, termasuk route session create, AI image generation, dan rendering attachment.
*   **Robust Parsing Test**: Berhasil menangani multiple JSON blocks dan trailing text.
*   **Typecheck**: PASS.
