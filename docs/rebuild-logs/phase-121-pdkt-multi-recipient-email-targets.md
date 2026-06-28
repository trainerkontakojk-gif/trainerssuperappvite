# Rebuild Log: Phase 121 - PDKT Multi-Recipient Email Targets

## Goal

Menambahkan dukungan email tujuan tambahan pada konfigurasi skenario PDKT, sehingga email awal simulasi dapat dikirim ke satu alamat atau banyak alamat per skenario tanpa mengubah kontrak mailbox/history yang sudah ada.

## What Changed

- **Per-scenario recipient settings** ditambahkan ke `PdktScenario`.
- **Mode penerima** didukung:
  - `single`
  - `multiple`
- **Fallback sistem** `konsumen@ojk.go.id` tetap selalu tersedia dan tidak bisa dihapus sebagai baseline perilaku.
- **Normalisasi draft settings** membersihkan spasi, lowercase, invalid email, dan duplikat sebelum disimpan.
- **Runtime recipient resolution** dipindahkan ke helper backend murni agar session init dan mailbox creation memakai aturan yang sama.
- **Email detail pane** sekarang menampilkan `to` asli dari payload message, bukan lagi string hardcoded.

## Contract Decisions

| Area | Decision |
|---|---|
| Settings storage | Tetap tersimpan di `user_settings.settings.pdkt` tanpa migrasi database baru. |
| Runtime contract | `EmailMessage.to` tetap string. Mode `multiple` diserialisasi sebagai comma-separated string. |
| Backward compatibility | Settings lama tanpa field recipient baru otomatis fallback ke `single` + `konsumen@ojk.go.id`. |
| Validation | Email invalid diblok saat save di UI dan disanitasi di backend helper. |

## Files Touched

- `packages/types/src/pdkt.ts`
- `apps/web/src/routes/pdkt/components/settings/pdktDraftNormalizers.ts`
- `apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts`
- `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx`
- `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioForm.tsx`
- `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioRecipientsField.tsx`
- `apps/web/src/routes/pdkt/components/EmailDetailPane.tsx`
- `apps/api/src/services/pdkt/recipient-targets.ts`
- `apps/api/src/services/pdkt/session-service.ts`
- `apps/api/src/__tests__/pdkt-session-service.test.ts`
- `apps/api/src/__tests__/pdkt-session-create-route.test.ts`
- `apps/web/src/__tests__/settings-draft-normalizers.test.ts`
- `apps/web/src/__tests__/settings-draft-helpers.test.ts`
- `apps/web/src/__tests__/pdkt-scenario-recipients.test.tsx`
- `apps/web/src/__tests__/pdkt-mailbox.test.tsx`

## Verification

- Web targeted tests: pass
- API targeted tests: pass
- ESLint on touched web/api files: pass

## Notes

Perubahan ini sengaja tidak mengubah `EmailMessage.to` menjadi array end-to-end supaya mailbox history, thread rendering, dan persistence route tidak perlu migrasi besar pada fase ini.

