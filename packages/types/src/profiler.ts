export interface ProfilerYear {
  id: string;
  year: number;
  label: string;
  created_at?: string;
}

export interface ProfilerFolder {
  id: string;
  name: string;
  trainer_id?: string | null;
  year_id?: string | null;
  parent_id?: string | null;
  created_at?: string;
}

export interface PhotoFrameValue {
  scale?: number;
  x?: number;
  y?: number;
}

export interface ProfilerPeserta {
  id: string;
  trainer_id?: string | null;
  batch_name: string;
  nomor_urut: number;
  nama: string;
  tim: string;
  jabatan: string;
  foto_url?: string | null;
  photo_frame?: PhotoFrameValue | null;
  nik_ojk?: string | null;
  bergabung_date?: string | null;
  email_ojk?: string | null;
  no_telepon?: string | null;
  no_telepon_darurat?: string | null;
  nama_kontak_darurat?: string | null;
  hubungan_kontak_darurat?: string | null;
  jenis_kelamin?: string | null;
  agama?: string | null;
  tgl_lahir?: string | null;
  status_perkawinan?: string | null;
  pendidikan?: string | null;
  no_ktp?: string | null;
  no_npwp?: string | null;
  nomor_rekening?: string | null;
  nama_bank?: string | null;
  alamat_tinggal?: string | null;
  status_tempat_tinggal?: string | null;
  nama_lembaga?: string | null;
  jurusan?: string | null;
  previous_company?: string | null;
  pengalaman_cc?: string | null;
  catatan_tambahan?: string | null;
  keterangan?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProfilerTim {
  id: string;
  nama: string;
  trainer_id?: string | null;
  created_at?: string;
}

export type JabatanKey =
  | "operation_manager"
  | "spv"
  | "team_leader"
  | "trainer"
  | "wfm"
  | "qa"
  | "cca_senior"
  | "cca"
  | "cso";

export const labelJabatan: Record<string, string> = {
  operation_manager: "Operation Manager",
  spv: "Supervisor",
  team_leader: "Team Leader",
  trainer: "Trainer",
  wfm: "WFM",
  qa: "QA",
  cca_senior: "CCA Senior",
  cca: "CCA",
  cso: "CSO",
};

export const labelTim: Record<string, string> = {
  telepon: "Tim Telepon",
  chat: "Tim Chat",
  email: "Tim Email",
};
