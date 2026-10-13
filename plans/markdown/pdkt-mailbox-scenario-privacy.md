# PDKT: tutup kebocoran data skenario ke peserta simulasi

Lane: **D** (security, RLS/grant migration, public API contract).

## Requirement

Sesi simulasi PDKT menguji kemampuan agent memahami email konsumen sendiri. Sebelum dan
sesudah membalas, permukaan simulasi tidak boleh memberi petunjuk yang tidak ada di isi email:

- karakter konsumen (`consumerType`: nama, deskripsi, tingkat kesulitan, nada);
- isi skenario (judul, deskripsi, `primaryRecipientType`, daftar penerima, kunci jawaban
  `expectedAnswer`);
- penerima email/arah balasan (`inbound_email.to`, `recipientContext`).

Temuan yang sudah diverifikasi di kode live (13 Okt 2026):

1. `GET /api/v1/pdkt/mailbox/:id` (`fetchMailboxItemById`) mengembalikan `scenario_snapshot` dan
   `config_snapshot` (tanpa `expectedAnswer`, tapi lengkap dengan `consumerType`, skenario, dan
   `recipientContext`) serta `inbound_email.to` + `recipientContext`. Web tidak memakai kedua
   snapshot itu; panel email menampilkan baris `Kepada:` dari `inbound_email.to`.
2. RLS `pdkt_mailbox_select_all` (`USING (true)`) + grant tabel default Supabase membuat setiap
   user `authenticated` bisa `SELECT` **semua kolom** semua mailbox langsung lewat PostgREST
   dengan JWT-nya sendiri, termasuk `scenario_snapshot.expectedAnswer` (kunci jawaban) dan
   `config_snapshot.consumerType`. Filter seperti `config_snapshot->consumerType->>id=eq.x` juga
   bisa dipakai untuk menebak isi.

Acceptance:

- A1. Dengan JWT agent, `SELECT` langsung ke `scenario_snapshot`, `config_snapshot`,
  `inbound_email`, `emails_thread` (termasuk `select=*` dan filter pada kolom itu) ditolak
  Postgres (`42501`). Kolom scalar (`id`, `subject`, `status`, …) tetap terbaca sehingga mailbox
  bersama tetap berfungsi.
- A2. `GET /api/v1/pdkt/mailbox/:id` untuk agent dan trainer mengembalikan subjek, isi, lampiran,
  dan thread, tetapi tidak memuat `scenario_snapshot`, `config_snapshot`, `recipientContext`, dan
  alamat penerima email konsumen (`to` = `""`). Payload tidak mengandung nama karakter,
  tingkat kesulitan, kunci jawaban, atau alamat penerima fixture.
- A3. `GET /api/v1/pdkt/mailbox` tetap mengembalikan item untuk agent; RPC balasan
  (`submit_pdkt_mailbox_reply_with_outcome`, SECURITY DEFINER) tetap membuat history; hapus oleh
  pembuat tetap berhasil.
- A4. Panel email web tidak menampilkan baris `Kepada:`/alamat penerima, bahkan bila payload
  lama masih memuat `to`.

Di luar cakupan (dicatat sebagai tindak lanjut):

- `pdkt_history.config` milik agent masih memuat `expectedAnswer` setelah balasan dikirim
  (RLS `select_own`, dibaca langsung). API sudah menyaringnya; pembatasan kolom DB butuh
  perubahan jalur baca history.
- Policy `pdkt_mailbox_insert_own` / `pdkt_mailbox_update_own` memungkinkan tulis langsung ke
  tabel di luar RPC.
- Mode latihan mandiri: agent memilih skenario dari pengaturannya sendiri, jadi judul/deskripsi
  skenario memang diketahui pembuatnya. Ujian yang adil memakai email yang dibuat trainer.

## Design

1. **Migration** `20261013120000_pdkt_mailbox_hide_snapshot_columns.sql` (+ rollback):
   `REVOKE SELECT ON public.pdkt_mailbox_items FROM anon, authenticated;` lalu
   `GRANT SELECT (<kolom scalar>) … TO authenticated`. Grant tabel-level harus dicabut dulu karena
   grant tabel mengalahkan revoke per-kolom. RLS tidak berubah. RPC SECURITY DEFINER tidak
   terdampak. Kolom baru di masa depan tidak otomatis terbaca client (fail-closed); komentar
   migration menjelaskannya.
2. **API** `fetchMailboxItemById`: baca kolom scalar dengan user JWT (RLS menentukan visibilitas,
   pola sama dengan `routes/pdkt/history.ts`), lalu ambil `inbound_email` + `emails_thread`
   dengan admin client hanya untuk id yang sudah lolos visibilitas. Proyeksi
   `toPdktSimulationEmail()` di `scenario-projections.ts` membuang `recipientContext` dan
   mengosongkan `to` untuk email non-agent. Respons memakai tipe baru
   `PdktMailboxDetailItem = Omit<PdktMailboxItem, "scenario_snapshot" | "config_snapshot">`.
3. **Web**: `EmailDetailPane` menghapus baris `Kepada:` dan fallback `konsumen@ojk.go.id`;
   state detail di `simulation.tsx` memakai `PdktMailboxDetailItem`.
4. **Docs**: `docs/modules.md` (kontrak detail mailbox) dan `docs/database.md` bila memuat grant.

## Tasklist

- [x] RED: `apps/web/e2e/pdkt-mailbox-privacy-api.spec.ts` (real backend, Supabase lokal) +
      project `pdkt-privacy-real-backend` di `playwright.api.config.ts`; jalankan, pastikan gagal
      di A1/A2.
- [x] RED: tes hermetic di `apps/web/e2e/pdkt-flow.spec.ts` untuk A4; jalankan, pastikan gagal.
- [x] GREEN: migration + rollback, API projection, tipe, web.
- [x] Jalankan ulang kedua spec, tipe-check `apps/api`, `apps/web`, `packages/types`, lint.
- [x] Review `thermo-nuclear`, dokumentasi, `git diff --check`.

## Evidence (13 Okt 2026, Supabase lokal via `scripts/integration/supabase-bootstrap.sh`)

- RED: `pdkt-mailbox-privacy-api.spec.ts` gagal — JWT agent membaca
  `scenario_snapshot.expectedAnswer`; detail API mengembalikan `inbound_email.to` penerima.
  `pdkt-flow.spec.ts` "panel email tidak menampilkan penerima" gagal (baris `Kepada:` ada).
- GREEN: ketiga test API dan 10/10 test `pdkt-flow.spec.ts` lulus setelah replay migrasi.
- Rollback round-trip: rollback → test tabel kembali RED; forward lagi → 3/3 lulus.
- Unit test lama yang bertentangan dan sudah tergantikan E2E dihapus:
  `describe("fetchMailboxItemById")` di `apps/api/src/__tests__/pdkt-mailbox-service.test.ts`
  dan "renders the actual recipient string" di `apps/web/src/__tests__/pdkt-mailbox.test.tsx`.
