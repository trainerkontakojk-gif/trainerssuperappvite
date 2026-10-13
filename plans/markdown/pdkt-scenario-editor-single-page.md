# PDKT: editor skenario satu halaman

Lane: **D** (redesain UI yang signifikan di dialog Pengaturan). Tidak ada perubahan API, skema, atau izin;
bentuk `PdktScenario` yang disimpan tetap sama.

Sumber desain: artboard `1c. Pengaturan — ubah skenario & arah balasan` di canvas "Redesign PDKT". Fajar
meminta 13 Okt 2026 ("kerjakan editor skenario satu halaman").

## Requirement

- E1. Mengubah atau membuat skenario membuka **satu halaman**, tanpa wizard dan langkah "Lanjut". Ada
  tombol kembali "Semua skenario" dan judul "Ubah skenario" / "Skenario baru".
- E2. Tiga bagian bernomor tampil bersamaan:
  1. **Kasusnya**: Judul skenario, Kategori (pilih atau tambah baru), "Isi email dibuat oleh" (AI, berbeda
     tiap sesi / Saya tulis sendiri) beserta penjelasannya. Mode AI menampilkan "Ringkasan masalah";
     mode tulis sendiri menampilkan subjek dan isi email.
  2. **Arah balasan**: kartu arah (Normatif / Jebakan / Substansi) dan email tambahan.
  3. **Kunci jawaban**: isian `expectedAnswer`. Petunjuknya mengikuti arah; untuk "minta bantuan OJK"
     diingatkan agar menulis jawaban substansi, bukan sekadar ucapan terima kasih.
- E3. **Opsi tambahan** (tertutup secara bawaan) berisi identitas pengirim khusus skenario dan lampiran.
- E4. Tombol bawah: **Hapus skenario** (hanya saat mengubah, dengan konfirmasi), **Batal**, dan
  **Tambahkan skenario** / **Terapkan perubahan**.
  - Saat diterapkan dengan isian salah, perubahan tidak diterapkan. Pesan tampil di bawah isian, dan
    fokus pindah ke isian pertama yang salah (Opsi tambahan dibuka bila salahnya ada di sana).
  - Batal dengan perubahan belum diterapkan meminta konfirmasi.
- E5. Hasil "Terapkan" langsung tampil di daftar dan memunculkan penanda "Belum disimpan". Data baru
  dikirim ke server lewat tombol **Simpan** dialog, seperti sebelumnya.

Keputusan:

- Kontrol global yang dulu ikut ada di wizard sudah punya tab sendiri, jadi tidak diduplikasi di editor:
  - karakter aktif dan detailnya → tab Karakter konsumen;
  - pola penyebutan nama → tab Identitas konsumen;
  - model AI, gaya tulisan, dan gambar lampiran → tab Gaya & AI.

  Akibatnya, snapshot pemulihan setting global saat Batal di wizard juga dihapus.

- Selama editor terbuka, header, menu, dan footer dialog disembunyikan seperti wizard lama. Dengan begitu
  tidak ada dua tombol simpan yang bersaing.

## Design

- Baru: `scenarios/ScenarioEditor.tsx` (tata letak + bagian bernomor), `scenarios/ScenarioModeField.tsx`
  (pilihan cara pembuatan email).
- Dihapus: `ScenarioForm.tsx`, `ScenarioWizardStepHeader.tsx`, `ScenarioCreationModePicker.tsx`,
  `ScenarioStickyFooter.tsx`, `ScenarioBasicsFields.tsx`. Tipe `ScenarioCreationMode` pindah ke
  `ScenarioCreationValidation.ts`.
- `PdktScenariosTab.tsx` menyederhanakan state: tidak ada lagi `step`, `emailVisited`, atau snapshot global.
  Validasi tetap memakai `getScenarioCreationValidation`; penyimpanan tetap lewat
  `normalizePdktScenarioDraft` + `scenarioForm.save`.
- Docs: `docs/modules.md` (bagian Scenario Editor Wizard → editor satu halaman).

## Tes

E2E hermetic `apps/web/e2e/pdkt-flow.spec.ts`:

- mengubah skenario: tiga bagian tampil sekaligus, judul terisi, arah dan kunci jawaban diubah, Terapkan,
  lalu Simpan mengirim `title`, `ojkRequestInBody`, dan `expectedAnswer` yang baru;
- skenario baru: validasi kosong (pesan + fokus), mode tulis sendiri mengganti ringkasan dengan isi email,
  dan hasilnya tampil di daftar sebagai "Tulis sendiri";
- hapus dari editor setelah konfirmasi.

## Tasklist

- [x] RED E2E (3 tes gagal: judul "Ubah skenario"/"Skenario baru" dan tombol "Hapus skenario" belum ada).
- [x] GREEN editor.
- [x] Spec PDKT penuh, typecheck, lint, build.
- [x] Review `thermo-nuclear`, cek visual, docs, `git diff --check`.

## Evidence (13 Okt 2026)

- RED: 3 tes editor gagal di wizard lama (judul "Ubah skenario"/"Skenario baru" dan tombol "Hapus skenario"
  tidak ada).
- Saat GREEN, dua temuan diperbaiki:
  - fokus galat mengikuti urutan helper lama (kategori dulu), padahal judul ada di atas; fokus kini mengikuti
    urutan tampil;
  - di tes, label "Isi email" bentrok dengan grup "Isi email dibuat oleh", jadi tes memakai role textbox.
- `pnpm exec playwright test e2e/pdkt-flow.spec.ts`: 16/16 lulus.
- Review:
  - `getScenarioCreationValidation` dirampingkan ke `errors` + `manualEmailBody`, karena output khusus
    wizard tidak dipakai lagi;
  - unit test lama `pdkt-scenario-recipients.test.tsx` ditambah prop `labelledBy` supaya root typecheck
    tetap lulus (tes tidak dijalankan);
  - "Hapus skenario" memakai teks netral dengan ikon merah, karena `--destructive` belum 4.5:1 sebagai teks
    kecil; di HP hanya ikon (label tetap ada untuk pembaca layar, target 44px).
- Cek visual: editor desktop terang (atas dan bawah, Opsi tambahan terbuka) dan HP gelap.
