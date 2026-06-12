# P1.7 PDKT Mailbox RPC Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development`; tests harus menjalankan Supabase lokal, bukan mock client.

## Goal

Memverifikasi tiga RPC mailbox PDKT terhadap PostgreSQL/Supabase nyata sehingga drift signature, grant, RLS, dan transactional behavior terdeteksi sebelum merge.

## Requirements

- Test menjalankan `submit_pdkt_mailbox_batch`, `submit_pdkt_mailbox_reply`, dan `soft_delete_pdkt_mailbox_item` pada Supabase lokal.
- Mencakup happy path, invalid payload, unauthorized role, ownership, idempotency, dan rollback/atomicity.
- Setup data deterministik dan cleanup tidak bergantung urutan test.
- CI menyediakan Supabase CLI/Docker dan menjalankan migration dari nol.
- Existing unit/route mock tests tetap dipertahankan untuk feedback cepat.

## Design

- Tambahkan tier `test:db-integration` terpisah dari unit/core.
- Gunakan Supabase local URL/keys dari `supabase status -o env`; jangan hardcode production credentials.
- Seed fixture minimal melalui service-role/admin setup, lalu panggil RPC sebagai anon/authenticated JWT yang sesuai.
- Reset database sebelum suite atau gunakan transaction/fixture namespace unik.
- Assert state tabel setelah RPC, bukan hanya response value.

## Tasklist

- [ ] Tambahkan script bootstrap yang menjalankan `supabase start`, `supabase db reset`, dan mengekspor env test.
- [ ] Buat helper integration client untuk service role dan authenticated users dengan role berbeda.
- [ ] Buat fixture mailbox/scenario/config yang valid dan deterministic cleanup.
- [ ] Test `submit_pdkt_mailbox_batch`: insert lengkap, `client_request_id` idempotent, payload invalid, dan caller unauthorized.
- [ ] Test `submit_pdkt_mailbox_reply`: history + email thread terbentuk atomik, time taken tersimpan, mailbox status berubah, dan duplicate/unauthorized ditolak.
- [ ] Test `soft_delete_pdkt_mailbox_item`: owner/admin success, non-owner failure, missing item, dan status/state setelah delete.
- [ ] Tambahkan signature/grant assertions untuk ketiga function.
- [ ] Tambahkan test replay seluruh migration dari database kosong sebelum RPC suite.
- [ ] Tambahkan root/API scripts `test:db-integration` tanpa memasukkannya ke fast unit tier.
- [ ] Tambahkan CI workflow/job dengan Docker service, Supabase CLI cache, timeout, dan log artifact saat gagal.
- [ ] Dokumentasikan command lokal, prerequisite Docker, dan troubleshooting port.
- [ ] Verifikasi suite dua kali dari clean reset untuk membuktikan determinisme.

## Risk Assessment

- **High:** CI flaky karena startup Docker/healthcheck.
- **Medium:** fixture bocor membuat test order-dependent.
- **Medium:** integration tier terlalu lambat lalu tidak dijalankan.
- **Mitigasi:** dedicated job, health polling, unique fixture IDs, clean reset, dan time budget yang tercatat.

## Rollback Plan

- Hapus job CI dan script integration tanpa mengubah RPC production.
- Unit/route tests tetap menjadi baseline.
- Tidak ada migration production yang diperlukan khusus untuk test infrastructure.
