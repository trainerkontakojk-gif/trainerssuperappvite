import { supabaseAdmin } from '../lib/supabase';
import type { ProfilerYear, ProfilerFolder, ProfilerPeserta, ProfilerTim } from '@trainers/types';

// ── Years ────────────────────────────────────────────────
export async function getYears(): Promise<ProfilerYear[]> {
  const { data } = await supabaseAdmin
    .from('profiler_years')
    .select('*')
    .order('year', { ascending: false });
  return data ?? [];
}

export async function createYear(year: number): Promise<ProfilerYear> {
  const label = `Tahun ${year}`;
  const { data, error } = await supabaseAdmin
    .from('profiler_years')
    .insert({ year, label })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteYear(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('profiler_years').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Folders ──────────────────────────────────────────────
export async function getFolders(): Promise<ProfilerFolder[]> {
  const { data } = await supabaseAdmin
    .from('profiler_folders')
    .select('*')
    .order('name');
  return data ?? [];
}

export async function createFolder(params: {
  name: string;
  year_id?: string;
  parent_id?: string;
}): Promise<ProfilerFolder> {
  const { data, error } = await supabaseAdmin
    .from('profiler_folders')
    .insert({ name: params.name, year_id: params.year_id ?? null, parent_id: params.parent_id ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function renameFolder(id: string, name: string): Promise<ProfilerFolder> {
  const { data, error } = await supabaseAdmin
    .from('profiler_folders')
    .update({ name })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('profiler_folders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function duplicateFolder(folderId: string, targetYearId: string): Promise<ProfilerFolder> {
  const { data: source, error: fetchError } = await supabaseAdmin
    .from('profiler_folders')
    .select('*')
    .eq('id', folderId)
    .single();
  if (fetchError) throw new Error('Folder tidak ditemukan');

  const newName = `${source.name} (copy)`;
  const { data, error } = await supabaseAdmin
    .from('profiler_folders')
    .insert({ name: newName, year_id: targetYearId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Peserta ──────────────────────────────────────────────
export async function getPeserta(params: {
  batch_name?: string;
  tim?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: ProfilerPeserta[]; total: number }> {
  let query = supabaseAdmin
    .from('profiler_peserta')
    .select('*', { count: 'exact' });

  if (params.batch_name) query = query.eq('batch_name', params.batch_name);
  if (params.tim) query = query.eq('tim', params.tim);
  if (params.search) query = query.ilike('nama', `%${params.search}%`);

  query = query.order('nomor_urut').order('nama');

  if (params.limit) {
    const from = params.offset ?? 0;
    query = query.range(from, from + params.limit - 1);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { data: data ?? [], total: count ?? 0 };
}

export async function getPesertaById(id: string): Promise<ProfilerPeserta> {
  const { data, error } = await supabaseAdmin
    .from('profiler_peserta')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error('Peserta tidak ditemukan');
  return data;
}

export async function getPesertaByBatch(batchName: string): Promise<ProfilerPeserta[]> {
  const { data } = await supabaseAdmin
    .from('profiler_peserta')
    .select('*')
    .eq('batch_name', batchName)
    .order('nomor_urut')
    .order('nama');
  return data ?? [];
}

export async function createPeserta(peserta: Partial<ProfilerPeserta>): Promise<ProfilerPeserta> {
  const { data, error } = await supabaseAdmin
    .from('profiler_peserta')
    .insert({
      batch_name: peserta.batch_name,
      nomor_urut: peserta.nomor_urut ?? 0,
      nama: peserta.nama,
      tim: peserta.tim,
      jabatan: peserta.jabatan,
      foto_url: peserta.foto_url ?? null,
      photo_frame: peserta.photo_frame ?? null,
      nik_ojk: peserta.nik_ojk ?? null,
      bergabung_date: peserta.bergabung_date ?? null,
      email_ojk: peserta.email_ojk ?? null,
      no_telepon: peserta.no_telepon ?? null,
      no_telepon_darurat: peserta.no_telepon_darurat ?? null,
      nama_kontak_darurat: peserta.nama_kontak_darurat ?? null,
      hubungan_kontak_darurat: peserta.hubungan_kontak_darurat ?? null,
      jenis_kelamin: peserta.jenis_kelamin ?? null,
      agama: peserta.agama ?? null,
      tgl_lahir: peserta.tgl_lahir ?? null,
      status_perkawinan: peserta.status_perkawinan ?? null,
      pendidikan: peserta.pendidikan ?? null,
      no_ktp: peserta.no_ktp ?? null,
      no_npwp: peserta.no_npwp ?? null,
      nomor_rekening: peserta.nomor_rekening ?? null,
      nama_bank: peserta.nama_bank ?? null,
      alamat_tinggal: peserta.alamat_tinggal ?? null,
      status_tempat_tinggal: peserta.status_tempat_tinggal ?? null,
      nama_lembaga: peserta.nama_lembaga ?? null,
      jurusan: peserta.jurusan ?? null,
      previous_company: peserta.previous_company ?? null,
      pengalaman_cc: peserta.pengalaman_cc ?? null,
      catatan_tambahan: peserta.catatan_tambahan ?? null,
      keterangan: peserta.keterangan ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updatePeserta(id: string, updates: Partial<ProfilerPeserta>): Promise<ProfilerPeserta> {
  const { data, error } = await supabaseAdmin
    .from('profiler_peserta')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePeserta(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('profiler_peserta').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function bulkCreatePeserta(items: Partial<ProfilerPeserta>[]): Promise<ProfilerPeserta[]> {
  const rows = items.map(item => ({
    batch_name: item.batch_name,
    nomor_urut: item.nomor_urut ?? 0,
    nama: item.nama,
    tim: item.tim,
    jabatan: item.jabatan,
    foto_url: item.foto_url ?? null,
    nik_ojk: item.nik_ojk ?? null,
    bergabung_date: item.bergabung_date ?? null,
    email_ojk: item.email_ojk ?? null,
    no_telepon: item.no_telepon ?? null,
    no_telepon_darurat: item.no_telepon_darurat ?? null,
    nama_kontak_darurat: item.nama_kontak_darurat ?? null,
    hubungan_kontak_darurat: item.hubungan_kontak_darurat ?? null,
    jenis_kelamin: item.jenis_kelamin ?? null,
    agama: item.agama ?? null,
    tgl_lahir: item.tgl_lahir ?? null,
    status_perkawinan: item.status_perkawinan ?? null,
    pendidikan: item.pendidikan ?? null,
    no_ktp: item.no_ktp ?? null,
    no_npwp: item.no_npwp ?? null,
    nomor_rekening: item.nomor_rekening ?? null,
    nama_bank: item.nama_bank ?? null,
    alamat_tinggal: item.alamat_tinggal ?? null,
    status_tempat_tinggal: item.status_tempat_tinggal ?? null,
    nama_lembaga: item.nama_lembaga ?? null,
    jurusan: item.jurusan ?? null,
    previous_company: item.previous_company ?? null,
    pengalaman_cc: item.pengalaman_cc ?? null,
    catatan_tambahan: item.catatan_tambahan ?? null,
    keterangan: item.keterangan ?? null,
  }));

  const { data, error } = await supabaseAdmin
    .from('profiler_peserta')
    .insert(rows)
    .select();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function copyPesertaToFolder(pesertaIds: string[], targetBatchName: string): Promise<number> {
  const { data: sourcePeserta } = await supabaseAdmin
    .from('profiler_peserta')
    .select('*')
    .in('id', pesertaIds);

  if (!sourcePeserta || sourcePeserta.length === 0) throw new Error('Peserta tidak ditemukan');

  const rows = sourcePeserta.map(p => ({
    batch_name: targetBatchName,
    nomor_urut: p.nomor_urut,
    nama: p.nama,
    tim: p.tim,
    jabatan: p.jabatan,
    foto_url: p.foto_url,
    nik_ojk: p.nik_ojk,
    bergabung_date: p.bergabung_date,
    email_ojk: p.email_ojk,
    no_telepon: p.no_telepon,
    no_telepon_darurat: p.no_telepon_darurat,
    nama_kontak_darurat: p.nama_kontak_darurat,
    hubungan_kontak_darurat: p.hubungan_kontak_darurat,
    jenis_kelamin: p.jenis_kelamin,
    agama: p.agama,
    tgl_lahir: p.tgl_lahir,
    status_perkawinan: p.status_perkawinan,
    pendidikan: p.pendidikan,
    no_ktp: p.no_ktp,
    no_npwp: p.no_npwp,
    nomor_rekening: p.nomor_rekening,
    nama_bank: p.nama_bank,
    alamat_tinggal: p.alamat_tinggal,
    status_tempat_tinggal: p.status_tempat_tinggal,
    nama_lembaga: p.nama_lembaga,
    jurusan: p.jurusan,
    previous_company: p.previous_company,
    pengalaman_cc: p.pengalaman_cc,
    catatan_tambahan: p.catatan_tambahan,
    keterangan: p.keterangan,
  }));

  const { data, error } = await supabaseAdmin
    .from('profiler_peserta')
    .insert(rows)
    .select();
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function reorderPeserta(pesertaIds: string[]): Promise<void> {
  const updates = pesertaIds.map((id, index) => ({
    id,
    nomor_urut: index,
  }));

  const { error } = await supabaseAdmin.rpc('bulk_reorder_profiler_peserta', {
    p_updates: JSON.stringify(updates),
  });

  if (error) {
    for (const update of updates) {
      await supabaseAdmin
        .from('profiler_peserta')
        .update({ nomor_urut: update.nomor_urut })
        .eq('id', update.id);
    }
  }
}

export async function getGlobalPesertaPool(excludeBatch?: string): Promise<ProfilerPeserta[]> {
  let query = supabaseAdmin
    .from('profiler_peserta')
    .select('*')
    .order('batch_name')
    .order('nama');

  if (excludeBatch) query = query.neq('batch_name', excludeBatch);

  const { data } = await query;
  return data ?? [];
}

// ── Teams ────────────────────────────────────────────────
export async function getTeams(): Promise<ProfilerTim[]> {
  const { data } = await supabaseAdmin
    .from('profiler_tim_list')
    .select('*')
    .order('nama');
  return data ?? [];
}

export async function createTeam(nama: string): Promise<ProfilerTim> {
  const { data, error } = await supabaseAdmin
    .from('profiler_tim_list')
    .insert({ nama })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('profiler_tim_list').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Counts ───────────────────────────────────────────────
export async function getFolderCounts(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin
    .from('profiler_peserta')
    .select('batch_name');
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.batch_name] = (counts[row.batch_name] ?? 0) + 1;
  }
  return counts;
}
