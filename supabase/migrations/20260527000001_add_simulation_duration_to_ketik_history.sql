-- ═══════════════════════════════════════════════════════
-- Migration: Add simulation_duration to ketik_history
-- ═══════════════════════════════════════════════════════
-- Kolom ini sudah ditulis dan dibaca oleh service
-- (ketik-service.ts persistSession dan getHistory)
-- tetapi tidak ada di definisi tabel awal (002_ketik_pdkt_core.sql).
-- Ini menyebabkan INSERT gagal → "Gagal menyimpan sesi".
--
-- Kolom nullable agar backward compatible dengan session lama
-- yang tidak memiliki data durasi.

ALTER TABLE public.ketik_history
  ADD COLUMN IF NOT EXISTS simulation_duration INTEGER;
