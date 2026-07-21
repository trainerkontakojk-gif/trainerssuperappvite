# Phase 211: KETIK Send-While-Loading (Consumer Typing UX)

**Ringkasan:** Pengguna kini dapat mengetik dan mengirim pesan baru saat consumer sedang merespon (isLoading = true). Sebelumnya input, tombol Kirim, dan Enter key diblokir selama proses generasi AI berlangsung.

## Perubahan

### 1. ChatInterface.tsx — Hapus blokade isLoading

Tiga titik di komponen yang menghalangi input saat `isLoading`:
- **Send guard:** `isLoading` dihapus dari kondisi `if (!inputText.trim() || isLoading || isOverLimit)` pada `handleSend()`
- **Enter key handler:** `!isLoading` dihapus dari kondisi `e.key === "Enter"`
- **Send button `disabled`:** `isLoading` dihapus dari atribut `disabled` dan styling class

**File:** `apps/web/src/routes/ketik/components/ChatInterface.tsx` (9 baris berubah, 4 lokasi)

### 2. Test Baru — Skenario input/Send saat loading

5 test case untuk memverifikasi UX tetap usable selama `isLoading`:

| Test | Assertion |
|------|-----------|
| textarea tetap enabled | `expect(input).not.toBeDisabled()` |
| bisa mengetik teks baru | `toHaveValue("Second message during loading")` |
| Send button tetap enabled | `expect(sendButton).not.toBeDisabled()` |
| bisa kirim pesan kedua saat pertama in-flight | `toHaveBeenCalledTimes(2)` + kedua pesan ada di history |
| Enter key tetap bisa kirim saat loading | `toHaveBeenCalledTimes(2)` |

**File:** `apps/web/src/__tests__/ketik-chat-interface.test.tsx` (+128 baris)

## Graphify

Graphify auto-sync dijalankan: `graphify-out/.graphify_labels.json`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json` diperbarui.

## Test Results

- **KETIK ChatInterface test:** 9 passed (4 existing + 5 baru)
- **Lint (web):** 0 errors (168 pre-existing warnings)
- **Build (web):** Passed (3.67s)
- **git diff --check:** Clean
