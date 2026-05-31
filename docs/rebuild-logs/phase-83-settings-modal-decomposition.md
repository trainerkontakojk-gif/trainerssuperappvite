# Rebuild Log - Phase 83: Settings Modal Decomposition

## Deskripsi

Mendekomposisi 3 komponen SettingsModal monolitik (Telefun, KETIK, PDKT) menjadi sub-modul per-tab dan mengekstrak logika CRUD form ke shared hook `useCrudForm`.

## Detail Perubahan

### Telefun SettingsModal (1,232 → 78 lines)

- **[MODIFY]** `SettingsModal.tsx` — hanya import + JSX rendering + tab routing
- **[MODIFY]** `settings/useTelefunSettingsDraft.ts` — state management dipindahkan ke hook
- **[NEW]** `settings/TelefunScenariosTab.tsx` (16.8K)
- **[NEW]** `settings/TelefunConsumersTab.tsx` (11.2K)
- **[NEW]** `settings/TelefunIdentityTab.tsx` (6.8K)
- **[NEW]** `settings/TelefunSystemTab.tsx` (14.3K)

### KETIK SettingsModal (915 → 58 lines)

- **[MODIFY]** `SettingsModal.tsx` — hanya import + JSX rendering + tab routing
- **[MODIFY]** `settings/useKetikSettingsDraft.ts` — state management dipindahkan ke hook
- **[NEW]** `settings/KetikScenariosTab.tsx` (20.8K)
- **[NEW]** `settings/KetikConsumersTab.tsx` (11.2K)
- **[NEW]** `settings/KetikIdentityTab.tsx` (4.3K)
- **[NEW]** `settings/KetikTemplateTab.tsx` (8.3K)
- (KetikSystemTab sudah ada dari Phase 75)

### PDKT SettingsModal (976 → 63 lines)

- **[MODIFY]** `SettingsModal.tsx` — hanya import + JSX rendering + tab routing
- **[MODIFY]** `settings/usePdktSettingsDraft.ts` — state management dipindahkan ke hook
- **[NEW]** `settings/PdktScenariosTab.tsx` (28.7K)
- **[NEW]** `settings/PdktConsumersTab.tsx` (14.0K)
- **[NEW]** `settings/PdktIdentityTab.tsx` (7.7K)
- (PdktSystemTab sudah ada dari Phase 75)

### Shared `useCrudForm` Hook

- **[NEW]** `apps/web/src/hooks/useCrudForm.ts` (87 lines) — reusable CRUD form state management:
  - `openAdd()` / `openEdit(item)` / `close()` — form lifecycle
  - `save(items)` / `remove(id, items)` — CRUD operations
  - `isDirty(items)` / `isValid()` — form validation helpers
  - Generic type `T extends { id: string }` untuk reusable di semua settings tab

### File Terpengaruh

| File | Aksi | Perubahan |
|------|------|-----------|
| `apps/web/src/hooks/useCrudForm.ts` | NEW | 87 lines |
| `apps/web/src/routes/telefun/components/SettingsModal.tsx` | MODIFY | 1,232 → 78 |
| `apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts` | MODIFY | refactored |
| `apps/web/src/routes/telefun/components/settings/TelefunScenariosTab.tsx` | NEW | 16.8K |
| `apps/web/src/routes/telefun/components/settings/TelefunConsumersTab.tsx` | NEW | 11.2K |
| `apps/web/src/routes/telefun/components/settings/TelefunIdentityTab.tsx` | NEW | 6.8K |
| `apps/web/src/routes/telefun/components/settings/TelefunSystemTab.tsx` | NEW | 14.3K |
| `apps/web/src/routes/ketik/components/SettingsModal.tsx` | MODIFY | 915 → 58 |
| `apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts` | MODIFY | refactored |
| `apps/web/src/routes/ketik/components/settings/KetikScenariosTab.tsx` | NEW | 20.8K |
| `apps/web/src/routes/ketik/components/settings/KetikConsumersTab.tsx` | NEW | 11.2K |
| `apps/web/src/routes/ketik/components/settings/KetikIdentityTab.tsx` | NEW | 4.3K |
| `apps/web/src/routes/ketik/components/settings/KetikTemplateTab.tsx` | NEW | 8.3K |
| `apps/web/src/routes/pdkt/components/SettingsModal.tsx` | MODIFY | 976 → 63 |
| `apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts` | MODIFY | refactored |
| `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx` | NEW | 28.7K |
| `apps/web/src/routes/pdkt/components/settings/PdktConsumersTab.tsx` | NEW | 14.0K |
| `apps/web/src/routes/pdkt/components/settings/PdktIdentityTab.tsx` | NEW | 7.7K |

## Pengujian & Verifikasi

- Pure decomposition — tidak ada perubahan behavior
- Masing-masing tab menangani form state-nya sendiri melalui `useCrudForm` hook
- SettingsModal bertindak sebagai barrel component untuk tab routing
- Graphify auto-sync
