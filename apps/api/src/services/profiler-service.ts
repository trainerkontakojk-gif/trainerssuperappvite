import { supabaseAdmin } from "../lib/supabase";
import type {
  ProfilerYear,
  ProfilerFolder,
  ProfilerPeserta,
  ProfilerTim,
} from "@trainers/types";

// ── Years ────────────────────────────────────────────────
export async function getYears(): Promise<ProfilerYear[]> {
  const { data } = await supabaseAdmin
    .from("profiler_years")
    .select("*")
    .order("year", { ascending: false });
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
export async function getFolders(): Promise<ProfilerFolder[]> {
  const { data } = await supabaseAdmin
    .from("profiler_folders")
    .select("*")
    .order("name");
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
  const { data, error } = await supabaseAdmin
    .from("profiler_folders")
    .update({ name })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiler_folders")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function duplicateFolder(
  folderId: string,
  targetYearId: string,
): Promise<ProfilerFolder> {
  const { data: source, error: fetchError } = await supabaseAdmin
    .from("profiler_folders")
    .select("*")
    .eq("id", folderId)
    .single();
  if (fetchError) throw new Error("Folder tidak ditemukan");

  const newName = `${source.name} (copy)`;
  const { data, error } = await supabaseAdmin
    .from("profiler_folders")
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
    .from("profiler_peserta")
    .select("*", { count: "exact" });

  if (params.batch_name) query = query.eq("batch_name", params.batch_name);
  if (params.tim) query = query.eq("tim", params.tim);
  if (params.search) query = query.ilike("nama", `%${params.search}%`);

  query = query.order("nomor_urut").order("nama");

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
    .from("profiler_peserta")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error("Peserta tidak ditemukan");
  return data;
}

export async function getPesertaByBatch(
  batchName: string,
): Promise<ProfilerPeserta[]> {
  const { data } = await supabaseAdmin
    .from("profiler_peserta")
    .select("*")
    .eq("batch_name", batchName)
    .order("nomor_urut")
    .order("nama");
  return data ?? [];
}

async function checkFotoUrl(
  fotoUrl: string | null | undefined,
): Promise<boolean> {
  if (!fotoUrl) return true;
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!supabaseUrl) return true;

  let filename = fotoUrl;
  if (fotoUrl.startsWith("http")) {
    const parts = fotoUrl.split("/foto-avatar/");
    if (parts.length > 1) {
      filename = parts[1];
    } else {
      filename = fotoUrl.substring(fotoUrl.lastIndexOf("/") + 1);
    }
  }

  const url = `${supabaseUrl}/storage/v1/object/public/foto-avatar/${filename}`;

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(id);

    if (response.status === 404) {
      return false;
    }
    return true;
  } catch (_err) {
    return true;
  }
}

function cleanEmptyStrings(obj: any) {
  const cleaned: any = {};
  for (const [key, val] of Object.entries(obj)) {
    cleaned[key] = val === "" ? null : val;
  }
  return cleaned;
}

export async function createPeserta(
  peserta: Partial<ProfilerPeserta>,
): Promise<ProfilerPeserta> {
  const isFotoValid = await checkFotoUrl(peserta.foto_url);
  if (!isFotoValid) {
    throw new Error("Avatar tidak ditemukan di storage");
  }

  const cleaned = cleanEmptyStrings(peserta);

  if (cleaned.batch_name && cleaned.nama) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("profiler_peserta")
      .select("id")
      .eq("batch_name", cleaned.batch_name)
      .eq("nama", cleaned.nama)
      .limit(1)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existing) {
      throw new Error(
        `Peserta dengan nama "${cleaned.nama}" sudah terdaftar di batch "${cleaned.batch_name}"`,
      );
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("profiler_peserta")
      .insert({
        batch_name: cleaned.batch_name,
        nomor_urut: cleaned.nomor_urut ?? 0,
        nama: cleaned.nama,
        tim: cleaned.tim,
        jabatan: cleaned.jabatan,
        foto_url: cleaned.foto_url ?? null,
        photo_frame: cleaned.photo_frame ?? null,
        nik_ojk: cleaned.nik_ojk ?? null,
        bergabung_date: cleaned.bergabung_date ?? null,
        email_ojk: cleaned.email_ojk ?? null,
        no_telepon: cleaned.no_telepon ?? null,
        no_telepon_darurat: cleaned.no_telepon_darurat ?? null,
        nama_kontak_darurat: cleaned.nama_kontak_darurat ?? null,
        hubungan_kontak_darurat: cleaned.hubungan_kontak_darurat ?? null,
        jenis_kelamin: cleaned.jenis_kelamin ?? null,
        agama: cleaned.agama ?? null,
        tgl_lahir: cleaned.tgl_lahir ?? null,
        status_perkawinan: cleaned.status_perkawinan ?? null,
        pendidikan: cleaned.pendidikan ?? null,
        no_ktp: cleaned.no_ktp ?? null,
        no_npwp: cleaned.no_npwp ?? null,
        nomor_rekening: cleaned.nomor_rekening ?? null,
        nama_bank: cleaned.nama_bank ?? null,
        alamat_tinggal: cleaned.alamat_tinggal ?? null,
        status_tempat_tinggal: cleaned.status_tempat_tinggal ?? null,
        nama_lembaga: cleaned.nama_lembaga ?? null,
        jurusan: cleaned.jurusan ?? null,
        previous_company: cleaned.previous_company ?? null,
        pengalaman_cc: cleaned.pengalaman_cc ?? null,
        catatan_tambahan: cleaned.catatan_tambahan ?? null,
        keterangan: cleaned.keterangan ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error: any) {
    if (error.code === "23505") {
      throw new Error(
        `Peserta dengan nama "${peserta.nama}" sudah terdaftar di batch "${peserta.batch_name}"`,
        { cause: error },
      );
    }
    throw new Error(error.message || String(error), { cause: error });
  }
}

export async function updatePeserta(
  id: string,
  updates: Partial<ProfilerPeserta>,
): Promise<ProfilerPeserta> {
  if (updates && "foto_url" in updates) {
    const isFotoValid = await checkFotoUrl(updates.foto_url);
    if (!isFotoValid) {
      throw new Error("Avatar tidak ditemukan di storage");
    }
  }

  const cleaned = cleanEmptyStrings(updates);

  try {
    const { data, error } = await supabaseAdmin
      .from("profiler_peserta")
      .update(cleaned)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error: any) {
    if (error.code === "23505") {
      let nama = updates.nama;
      let batchName = updates.batch_name;
      if (!nama || !batchName) {
        const existing = await getPesertaById(id).catch(() => null);
        nama = nama || existing?.nama || "";
        batchName = batchName || existing?.batch_name || "";
      }
      throw new Error(
        `Peserta dengan nama "${nama}" sudah terdaftar di batch "${batchName}"`,
        { cause: error },
      );
    }
    throw new Error(error.message || String(error), { cause: error });
  }
}

export async function deletePeserta(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiler_peserta")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function bulkCreatePeserta(
  items: Partial<ProfilerPeserta>[],
): Promise<ProfilerPeserta[]> {
  if (items.length === 0) {
    throw new Error("Tidak ada data peserta untuk diimpor");
  }

  const batchNames = Array.from(
    new Set(items.map((item) => item.batch_name).filter(Boolean) as string[]),
  );

  const existingNamesByBatch: Record<string, Set<string>> = {};
  if (batchNames.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from("profiler_peserta")
      .select("batch_name, nama")
      .in("batch_name", batchNames);

    if (existing) {
      for (const p of existing) {
        if (!existingNamesByBatch[p.batch_name]) {
          existingNamesByBatch[p.batch_name] = new Set();
        }
        existingNamesByBatch[p.batch_name].add(p.nama.toLowerCase().trim());
      }
    }
  }

  const uniqueRowsToInsert: typeof items = [];
  const processedKeys = new Set<string>();

  for (const item of items) {
    if (!item.batch_name || !item.nama) continue;
    const batch = item.batch_name;
    const name = item.nama;
    const key = `${batch.toLowerCase().trim()}::${name.toLowerCase().trim()}`;

    const isExistingInDb =
      existingNamesByBatch[batch]?.has(name.toLowerCase().trim()) ?? false;
    const isExistingInImport = processedKeys.has(key);

    if (!isExistingInDb && !isExistingInImport) {
      uniqueRowsToInsert.push(item);
      processedKeys.add(key);
    }
  }

  if (uniqueRowsToInsert.length === 0) {
    throw new Error(
      "Semua peserta dalam daftar sudah terdaftar di batch masing-masing",
    );
  }

  const rows = uniqueRowsToInsert.map((item) => ({
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
    .from("profiler_peserta")
    .insert(rows)
    .select();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Ada peserta yang sudah terdaftar di batch");
    }
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function copyPesertaToFolder(
  pesertaIds: string[],
  targetBatchName: string,
): Promise<number> {
  const { data: sourcePeserta } = await supabaseAdmin
    .from("profiler_peserta")
    .select("*")
    .in("id", pesertaIds);

  if (!sourcePeserta || sourcePeserta.length === 0)
    throw new Error("Peserta tidak ditemukan");

  const { data: existingPeserta } = await supabaseAdmin
    .from("profiler_peserta")
    .select("nama")
    .eq("batch_name", targetBatchName);

  const existingNames = new Set(
    (existingPeserta || []).map((p) => p.nama.toLowerCase().trim()),
  );

  const uniqueRowsToInsert: typeof sourcePeserta = [];
  const processedNames = new Set<string>();

  for (const p of sourcePeserta) {
    const normName = p.nama.toLowerCase().trim();
    if (!existingNames.has(normName) && !processedNames.has(normName)) {
      uniqueRowsToInsert.push(p);
      processedNames.add(normName);
    }
  }

  if (uniqueRowsToInsert.length === 0) {
    throw new Error(
      `Semua peserta yang disalin sudah terdaftar di batch "${targetBatchName}"`,
    );
  }

  const rows = uniqueRowsToInsert.map((p) => ({
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
    .from("profiler_peserta")
    .insert(rows)
    .select();
  if (error) {
    if (error.code === "23505") {
      throw new Error(
        `Ada peserta yang sudah terdaftar di batch "${targetBatchName}"`,
      );
    }
    throw new Error(error.message);
  }
  return data?.length ?? 0;
}

export async function reorderPeserta(pesertaIds: string[]): Promise<void> {
  const updates = pesertaIds.map((id, index) => ({
    id,
    nomor_urut: index + 1,
  }));

  const { error } = await supabaseAdmin.rpc("bulk_reorder_profiler_peserta", {
    p_updates: updates,
  });

  if (error) {
    for (const update of updates) {
      await supabaseAdmin
        .from("profiler_peserta")
        .update({ nomor_urut: update.nomor_urut })
        .eq("id", update.id);
    }
  }
}

export async function bulkReorderPeserta(
  updates: { id: string; nomor_urut: number }[],
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("bulk_reorder_profiler_peserta", {
    p_updates: updates,
  });
  if (error) throw new Error(error.message);
}

export async function getGlobalPesertaPool(
  excludeBatch?: string,
): Promise<ProfilerPeserta[]> {
  let query = supabaseAdmin
    .from("profiler_peserta")
    .select("*")
    .order("batch_name")
    .order("nama");

  if (excludeBatch) query = query.neq("batch_name", excludeBatch);

  const { data } = await query;
  return data ?? [];
}

// ── Teams ────────────────────────────────────────────────
export async function getTeams(): Promise<ProfilerTim[]> {
  const { data } = await supabaseAdmin
    .from("profiler_tim_list")
    .select("*")
    .order("nama");
  return data ?? [];
}

export async function createTeam(nama: string): Promise<ProfilerTim> {
  const { data, error } = await supabaseAdmin
    .from("profiler_tim_list")
    .insert({ nama })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiler_tim_list")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Counts ───────────────────────────────────────────────
export async function getFolderCounts(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin
    .from("profiler_peserta")
    .select("batch_name");
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.batch_name] = (counts[row.batch_name] ?? 0) + 1;
  }
  return counts;
}
