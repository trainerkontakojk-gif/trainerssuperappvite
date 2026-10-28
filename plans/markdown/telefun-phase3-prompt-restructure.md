# Telefun Fase 3 — struktur prompt konsumen

## Requirement

Tugas Emilia95204833 atas permintaan Fajar. Lane C: prompt behavior terbatas, enam tipe. Kontrak peran tetap utuh paling atas; identitas, batas pengetahuan, sanitasi, hold, time cue/penutupan dan de-eskalasi tetap. Semua contoh ucapan lama dan pemilihan voice tetap. Tidak ada contoh/fakta/SLA/nominal baru, provider nyata, DB, commit atau push.

## Design

Checkpoint A: hanya susun ulang blok prompt existing: peran -> identitas dan batas konsumen -> kontrol hold/waktu/penutupan -> profil, reaksi, tempo dan ekspresi -> contoh existing -> data skenario tidak tepercaya -> technical voice dan angry reminder existing. Preserve literal tiap blok; speech examples, identity/sanitizer/time controls unchanged.

Checkpoint B terpisah: koreksi arahan yang bertentangan (nada datar kritis saat hold lama; volume marah wajib tinggi sepanjang panggilan vs de-eskalasi; generic menunggu sabar vs tipe mendesak). Bukan contoh ucapan baru. Simpan incremental A dan B terpisah di Shared agar reviewer dapat membedakan tanpa commit.

## Tasklist

- [ ] E2E matriks enam tipe: order, no contradiction, identity/knowledge, hold/time/closure, de-escalation, sanitization, legacy challenges; RED nyata sebelum source edit.
- [ ] Checkpoint A reorder; checkpoint B contradictions; contoh lama unchanged.
- [ ] GREEN consumer-prompt dan telefun-flow serial via resource gate.
- [ ] Web typecheck, root lint, Prettier, diff-check serial; stop unexplained failure.
- [ ] docs/telefun.md, CHANGELOG, dan Shared/telefun/ram-phase3.md before/after enam tipe, manifest dan scope proof.
