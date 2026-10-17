/**
 * Profiler years and folders (batches): listing within the caller's data
 * scope, create/rename/delete/duplicate, and per-folder participant counts.
 */

import { supabaseAdmin } from "../lib/supabase";
import { fetchAllPages } from "../lib/supabase-pagination";
import type {
  ProfilerYear,
  ProfilerFolder,
  ProfilerPeserta,
} from "@trainers/types";

type ScopedFolderReference = Pick<
  ProfilerFolder,
  "id" | "name" | "parent_id" | "year_id"
>;

function getUniqueScopedBatches(rows: { batch_name: string | null }[]) {
  return [
    ...new Set(rows.map((r) => r.batch_name).filter(Boolean)),
  ] as string[];
}

// ── Years ────────────────────────────────────────────────
export async function getYears(
  accessibleIds?: string[] | null,
): Promise<ProfilerYear[]> {
  if (accessibleIds !== null && accessibleIds !== undefined) {
    if (accessibleIds.length === 0) return [];
    const scopedBatchRows = await fetchAllPages<{ batch_name: string | null }>({
      build: ({ from, to }) =>
        supabaseAdmin
          .from("profiler_peserta")
          .select("batch_name")
          .in("id", accessibleIds)
          .order("batch_name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    });
    const scopedBatches = getUniqueScopedBatches(scopedBatchRows);
    if (scopedBatches.length === 0) return [];
    const scopedFolders = await fetchAllPages<ScopedFolderReference>({
      build: ({ from, to }) =>
        supabaseAdmin
          .from("profiler_folders")
          .select("id,name,parent_id,year_id")
          .in("name", scopedBatches)
          .order("year_id", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    });
    const parentIds = [
      ...new Set(scopedFolders.map((f) => f.parent_id).filter(Boolean)),
    ] as string[];
    const parentFolders =
      parentIds.length > 0
        ? await fetchAllPages<ScopedFolderReference>({
            build: ({ from, to }) =>
              supabaseAdmin
                .from("profiler_folders")
                .select("id,name,parent_id,year_id")
                .in("id", parentIds)
                .order("year_id", { ascending: true })
                .order("id", { ascending: true })
                .range(from, to),
          })
        : [];
    const scopedYearIds = [
      ...new Set(
        [...scopedFolders, ...parentFolders]
          .map((f) => f.year_id)
          .filter(Boolean),
      ),
    ] as string[];
    if (scopedYearIds.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("profiler_years")
      .select("*")
      .in("id", scopedYearIds)
      .order("year", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  const { data, error } = await supabaseAdmin
    .from("profiler_years")
    .select("*")
    .order("year", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createYear(year: number): Promise<ProfilerYear> {
  const label = `Tahun ${year}`;
  const { data, error } = await supabaseAdmin
    .from("profiler_years")
    .insert({ year, label })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteYear(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiler_years")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Folders ──────────────────────────────────────────────
export async function getFolders(
  accessibleIds?: string[] | null,
): Promise<ProfilerFolder[]> {
  if (accessibleIds !== null && accessibleIds !== undefined) {
    if (accessibleIds.length === 0) return [];
    const scopedBatchRows = await fetchAllPages<{ batch_name: string | null }>({
      build: ({ from, to }) =>
        supabaseAdmin
          .from("profiler_peserta")
          .select("batch_name")
          .in("id", accessibleIds)
          .order("batch_name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    });
    const scopedBatches = getUniqueScopedBatches(scopedBatchRows);
    if (scopedBatches.length === 0) return [];
    const data = await fetchAllPages<ProfilerFolder>({
      build: ({ from, to }) =>
        supabaseAdmin
          .from("profiler_folders")
          .select("*")
          .in("name", scopedBatches)
          .order("name")
          .order("id", { ascending: true })
          .range(from, to),
    });
    const parentIds = [
      ...new Set(data.map((folder) => folder.parent_id).filter(Boolean)),
    ] as string[];
    const parentFolders =
      parentIds.length > 0
        ? await fetchAllPages<ProfilerFolder>({
            build: ({ from, to }) =>
              supabaseAdmin
                .from("profiler_folders")
                .select("*")
                .in("id", parentIds)
                .order("name")
                .order("id", { ascending: true })
                .range(from, to),
          })
        : [];
    const foldersById = new Map<string, ProfilerFolder>();
    for (const folder of [...parentFolders, ...data]) {
      foldersById.set(folder.id, folder);
    }
    return [...foldersById.values()];
  }

  const data = await fetchAllPages<ProfilerFolder>({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("profiler_folders")
        .select("*")
        .order("name")
        .order("id", { ascending: true })
        .range(from, to),
  });
  return data ?? [];
}

export async function createFolder(params: {
  name: string;
  year_id?: string;
  parent_id?: string;
}): Promise<ProfilerFolder> {
  const { data, error } = await supabaseAdmin
    .from("profiler_folders")
    .insert({
      name: params.name,
      year_id: params.year_id ?? null,
      parent_id: params.parent_id ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function renameFolder(
  id: string,
  name: string,
): Promise<ProfilerFolder> {
  // 1. Get old name first
  const { data: folder, error: fetchError } = await supabaseAdmin
    .from("profiler_folders")
    .select("name")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error("Folder tidak ditemukan");

  const oldName = folder.name;

  // 2. Update folder name
  const { data, error } = await supabaseAdmin
    .from("profiler_folders")
    .update({ name })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // 3. Sync batch_name on all peserta in this folder
  const { error: pesertaErr } = await supabaseAdmin
    .from("profiler_peserta")
    .update({ batch_name: name })
    .eq("batch_name", oldName);
  if (pesertaErr)
    console.error("Gagal update batch_name peserta:", pesertaErr.message);

  return data;
}

export async function deleteFolder(id: string): Promise<void> {
  // 1. Get folder name for peserta lookup
  const { data: folder, error: fetchError } = await supabaseAdmin
    .from("profiler_folders")
    .select("name")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error("Folder tidak ditemukan");

  // 2. Hapus semua peserta di folder ini
  const { error: pesertaErr } = await supabaseAdmin
    .from("profiler_peserta")
    .delete()
    .eq("batch_name", folder.name);
  if (pesertaErr)
    throw new Error("Gagal menghapus data peserta: " + pesertaErr.message);

  // 3. Hapus folder
  const { error } = await supabaseAdmin
    .from("profiler_folders")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function duplicateFolder(
  folderId: string,
  targetYearId: string,
): Promise<{ folder: ProfilerFolder; participants: ProfilerPeserta[] }> {
  const { data: source, error: fetchError } = await supabaseAdmin
    .from("profiler_folders")
    .select("*")
    .eq("id", folderId)
    .single();
  if (fetchError) throw new Error("Folder tidak ditemukan");

  // Handle name conflict in target year
  let newName = source.name;
  const { data: existing } = await supabaseAdmin
    .from("profiler_folders")
    .select("name")
    .eq("year_id", targetYearId)
    .eq("name", newName);

  if (existing && existing.length > 0) {
    newName = `${source.name} (Copy)`;
  }

  const { data: folder, error } = await supabaseAdmin
    .from("profiler_folders")
    .insert({ name: newName, year_id: targetYearId })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Copy participants
  const participants = await fetchAllPages<any>({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("profiler_peserta")
        .select("*")
        .eq("batch_name", source.name)
        .order("nomor_urut", { ascending: true })
        .order("nama", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  });

  const newParticipants: ProfilerPeserta[] = [];
  if (participants.length > 0) {
    const rows = participants.map((p) => ({
      batch_name: newName,
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
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("profiler_peserta")
      .insert(rows)
      .select();
    if (!insErr && inserted) {
      newParticipants.push(...inserted);
    }
  }

  return { folder, participants: newParticipants };
}

// ── Counts ───────────────────────────────────────────────
export async function getFolderCounts(
  accessibleIds?: string[] | null,
): Promise<Record<string, number>> {
  if (
    accessibleIds !== null &&
    accessibleIds !== undefined &&
    accessibleIds.length === 0
  ) {
    return {};
  }

  const { data, error } = await supabaseAdmin.rpc(
    "get_profiler_folder_counts",
    {
      p_accessible_ids: accessibleIds ?? null,
    },
  );

  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.batch_name] = Number(row.peserta_count ?? 0);
  }
  return counts;
}
