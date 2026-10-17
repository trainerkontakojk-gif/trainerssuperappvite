# Telefun — hapus fitur Tantangan percakapan (Lane C)

## Requirement

Fajar memilih menghapus seluruh fitur "Tantangan percakapan" (2026-10-17) setelah audit menunjukkan fitur ini merusak alur konsumen AI: aturan "satu tantangan per giliran" dibaca AI sebagai jatah tiap giliran, "Suara Tidak Jelas" tidak punya pemicu nyata, beberapa tantangan bentrok dengan tipe konsumen, dan hasilnya tidak dipakai penilaian.

## Design

- Hapus `apps/web/src/routes/telefun/services/simulationChallenges.ts`.
- `promptBuilder.ts`: tanpa blok TANTANGAN PERCAKAPAN; aturan menyela hanya bergantung tipe konsumen (Marah/Terburu-buru boleh menyela, tipe lain tidak).
- `telefunSettings.ts` dan `useTelefunSettingsDraft.ts`: field `simulationChallengeTypes` dihapus dan dibuang dari setelan lama saat dibaca maupun disimpan.
- `TelefunSystemTab.tsx`: bagian pilihan tantangan dihapus.
- `index.tsx`: sesi baru tidak lagi mengirim `disruption_config`.
- Tidak mengubah API, skema, atau kolom database; data sesi lama tetap terbaca.

## Tasklist

- [x] RED: E2E setelan tanpa tantangan dan prompt mengabaikan tantangan tersimpan.
- [x] GREEN: hapus fitur dari web.
- [x] Sesuaikan tes unit lama yang memakai field yang dihapus.
- [x] Typecheck, lint, build, E2E Telefun, `git diff --check`.
