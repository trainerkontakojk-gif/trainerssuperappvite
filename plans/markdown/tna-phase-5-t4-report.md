# TNA Fase 5 — Laporan T4 (parameter SIDAK lama tanpa master)

- **Tanggal:** 2026-11-07. Baseline `8ef8cd74` (`main`).
- **Rencana:** [`tna-phase-5.md`](tna-phase-5.md) rev. 2, D27 langkah 1–2; izin query produksi read-only dari Fajar (K37).
- **Target:** produksi `ruosnjmtywcrghjgqugz`, **hanya SELECT** di dalam `BEGIN READ ONLY … COMMIT`. Tidak ada tulis, migrasi, atau RPC.

## Query

Dijalankan 04:42 UTC dengan `supabase db query --linked -f <file>` (project tertaut dicek dulu: `supabase/.temp/project-ref` = `ruosnjmtywcrghjgqugz`).

1. Query pertama di [`sidak-unmapped-indicator-findings.md`](sidak-unmapped-indicator-findings.md) §Query produksi, tanpa perubahan logika: snapshot `qa_service_rule_indicators` dengan `legacy_indicator_id IS NULL`, dikelompokkan per versi aturan.
2. Query kedua (mapping menggantung, A3), ditambah hitungan konteks:

```sql
BEGIN READ ONLY;
SELECT
  (SELECT count(*) FROM qa_service_rule_indicators ri
    WHERE ri.legacy_indicator_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM qa_indicators i WHERE i.id = ri.legacy_indicator_id)) AS dangling,
  (SELECT count(*) FROM qa_service_rule_indicators) AS total_snapshots,
  (SELECT count(*) FROM qa_service_rule_indicators WHERE legacy_indicator_id IS NULL) AS total_unmapped,
  (SELECT count(*) FROM qa_service_rule_versions) AS total_versions,
  (SELECT string_agg(status || ':' || n, ', ' ORDER BY status)
     FROM (SELECT status, count(*) n FROM qa_service_rule_versions GROUP BY status) s) AS versions_by_status;
COMMIT;
```

## Hasil

| Ukuran                                   | Nilai                                   |
| ---------------------------------------- | --------------------------------------- |
| Versi dengan snapshot unmapped (query 1) | **0 baris**                             |
| Snapshot unmapped total                  | **0**                                   |
| Mapping menggantung (A3)                 | **0**                                   |
| Snapshot parameter total                 | 102                                     |
| Versi aturan                             | 10 (draft 1, published 8, superseded 1) |

Kedua perintah exit 0.

## Kesimpulan (D27 langkah 2)

- **Tidak ada data lama yang perlu dipetakan.** Setiap snapshot parameter di produksi sudah punya master `qa_indicators`, jadi setiap parameter bisa dicatat sebagai temuan dan terbaca TNA lewat `qa_temuan.indicator_id` (K8).
- **T6 rencana SIDAK (backfill) tidak diperlukan.** K-d diputuskan dengan strategi 1 ("tidak backfill") karena nol baris. Ditandai di `sidak-unmapped-indicator-findings.md`.
- **T5 Fase 5 (migrasi backfill) tidak dijalankan.** Tidak ada migrasi baru.
- **Prasyarat deploy SIDAK terpenuhi:** Sesi Tanpa Temuan tidak akan menolak versi published karena snapshot tanpa master.
- **Catatan untuk K-e (FK `legacy_indicator_id`, ditunda):** syarat awalnya, nol mapping menggantung, kini terbukti di produksi per 2026-11-07. FK itu tetap di luar cakupan Fase 5 dan butuh rencana serta izin migrasi tersendiri.

## Dokumen diperbarui

- `docs/database.md`: catatan `qa_service_rule_indicators` menyebut hasil query produksi.
- `plans/markdown/sidak-unmapped-indicator-findings.md`: K-d dan T6.
- `plans/markdown/tna-phase-5.md`: status T4 selesai, T5 tidak diperlukan.

## Berikutnya

T6: review `thermo-nuclear`, sinkron `docs/{modules,database,auth-rbac}.md`, gate serial, `graphify update .`, `tna-phase-5-t6-report.md`.
