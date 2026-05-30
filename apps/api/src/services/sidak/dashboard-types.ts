import type { ServiceType } from "@trainers/types";

export type DashboardTemuanRow = {
  id?: string;
  peserta_id: string;
  period_id: string;
  indicator_id: string;
  service_type?: ServiceType | string | null;
  tahun?: number | null;
  nilai?: number | null;
  is_phantom_padding?: boolean | null;
  profiler_peserta?: {
    id?: string;
    nama?: string | null;
    batch_name?: string | null;
    tim?: string | null;
    jabatan?: string | null;
  } | null;
};

export type DashboardAgentGroup = {
  id: string;
  nama: string;
  batch_name: string;
  tim: string;
  jabatan: string;
  rows: DashboardTemuanRow[];
};

export type DashboardWeightMap = Record<string, unknown>;
