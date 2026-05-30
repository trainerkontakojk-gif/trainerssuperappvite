# Rebuild Log - Phase 76: Types Circular Dependency Fix

## Deskripsi

Memperbaiki circular dependency antara `packages/types/src/index.ts` dan `packages/types/src/ai-models.ts` yang menyebabkan Railway deployment crash dengan error:

```
SyntaxError: The requested module '@trainers/types' does not provide an export named 'AI_MODELS'
```

**Root cause:**
- `index.ts` → `export * from "./ai-models"` (re-export `AI_MODELS`)
- `ai-models.ts` → `import type { AiModelInfo } from "./index"` (import type)

Circular re-export chain ini tidak bisa di-resolve oleh `tsx` di lingkungan Railway, menyebabkan `SyntaxError` saat startup.

## File Terpengaruh

- **[MODIFY]** `packages/types/src/ai-models.ts` — Memindahkan definisi `AiModelInfo` dan `AIProvider` dari `index.ts` ke sini, menghapus `import type` dari `./index`, memutus circular dependency.
- **[MODIFY]** `packages/types/src/index.ts` — Menambahkan `import type { AiModelInfo, AIProvider } from "./ai-models"`, menghapus definisi duplikat `AiModelInfo`/`AIProvider` yang sebelumnya didefinisikan inline.

## Detail Perubahan

Sebelum (circular):
```
ai-models.ts ──import type──> index.ts
index.ts    ──export *──> ai-models.ts  (circular!)
```

Sesudah (unidirectional):
```
ai-models.ts ──> self-contained (defines AiModelInfo, AIProvider, AI_MODELS)
index.ts    ──import type──> ai-models.ts  (clean, single direction)
```

## Pengujian & Verifikasi

- **Build:** `pnpm build` — 3 tasks sukses (API, Web, Telefun)
- **Lint:** Belum dijalankan (akan diverifikasi saat pre-push)
- **Test:** Belum dijalankan (akan diverifikasi saat pre-push)
