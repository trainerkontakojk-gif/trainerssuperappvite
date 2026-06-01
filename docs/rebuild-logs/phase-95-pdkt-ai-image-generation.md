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
    *   **Attachment Policy**: Manual Attachments > AI Generated Images > None.

6.  **Simplified Frontend Flow**:
    *   `apps/api/src/routes/pdkt.ts`: Endpoint baru `POST /session/init`.
    *   `apps/web/src/routes/pdkt/simulation.tsx`: Client-side logic disederhanakan.

### File Affected

*   `apps/api/src/lib/ai-json.ts`: New robust parser utility.
*   `packages/types/src/ai-models.ts`: Capability metadata.
*   `apps/api/src/services/pdkt-service.ts`: Orchestration & re-export parser.
*   `apps/api/src/services/ketik/shared-utils.ts`: Robust parser adoption.
*   `apps/api/src/services/sidak/ai-report-service.ts`: Robust report parsing.
*   `apps/api/src/lib/telefun-analysis.ts`: Robust analysis parsing.
*   `apps/api/src/routes/pdkt.ts`: Endpoint `/session/init`.
*   `apps/web/src/routes/pdkt/simulation.tsx`: Start flow simplification.

### Testing & Verification

*   **PDKT Tests**: 85 tests PASS (termasuk unit, integration, dan robust parsing test).
*   **Robust Parsing Test**: Berhasil menangani multiple JSON blocks dan trailing text.
*   **Typecheck**: PASS.
