import { supabaseAdmin } from "../lib/supabase";
import { fetchAllPages } from "../lib/supabase-pagination";
import { getLeaderScopeSnapshot } from "./leader-access-service";
import { checkProfilerPhotoUrl } from "./profiler-photo-storage";
import type {
  ProfilerYear,
  ProfilerFolder,
  ProfilerPeserta,
  ProfilerTim,
} from "@trainers/types";

const TRAINER_ROLES = ["admin", "trainer"] as const;
const LEADER_ROLES = ["leader"] as const;

export async function getAccessiblePesertaIds(
  userId: string,
  role: string,
): Promise<string[] | null> {
  if ((TRAINER_ROLES as readonly string[]).includes(role)) return null;

  if (role === "agent") {
    const { data } = await supabaseAdmin
      .from("profiler_peserta")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    return data ? [data.id] : [];
  }

  if ((LEADER_ROLES as readonly string[]).includes(role)) {
    const snapshot = await getLeaderScopeSnapshot(userId, "ktp");
    return snapshot.pesertaIds;
  }

  return [];
}

// ── Years ────────────────────────────────────────────────
export async function getYears(
  accessibleIds?: string[] | null,
): Promise<ProfilerYear[]> {
  if (accessibleIds !== null && accessibleIds !== undefined) {
    if (accessibleIds.length === 0) return [];
    const { data: scopedBatchRows } = await supabaseAdmin
      .from("profiler_peserta")
      .select("batch_name")
      .in("id", accessibleIds);
    const scopedBatches = [
      ...new Set((scopedBatchRows ?? []).map((r) => r.batch_name).filter(Boolean)),
    ] as string[];
    if (scopedBatches.length === 0) return [];
    const { data: scopedFolders } = await supabaseAdmin
      .from("profiler_folders")
      .select("year_id")
      .in("name", scopedBatches);
    const scopedYearIds = [
      ...new Set((scopedFolders ?? []).map((f) => f.year_id).filter(Boolean)),
    ] as string[];
    if (scopedYearIds.length === 0) return [];
    const { data } = await supabaseAdmin
      .from("profiler_years")
      .select("*")
      .in("id", scopedYearIds)
      .order("year", { ascending: false });
    return data ?? [];
  }

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
export async function getFolders(
  accessibleIds?: string[] | null,
): Promise<ProfilerFolder[]> {
  if (accessibleIds !== null && accessibleIds !== undefined) {
    if (accessibleIds.length === 0) return [];
    const { data: scopedBatchRows } = await supabaseAdmin
      .from("profiler_peserta")
      .select("batch_name")
      .in("id", accessibleIds);
    const scopedBatches = [
      ...new Set((scopedBatchRows ?? []).map((r) => r.batch_name).filter(Boolean)),
    ] as string[];
    if (scopedBatches.length === 0) return [];
    const { data } = await supabaseAdmin
      .from("profiler_folders")
      .select("*")
      .in("name", scopedBatches)
      .order("name");
    return data ?? [];
  }

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
  if (pesertaErr) console.error("Gagal update batch_name peserta:", pesertaErr.message);

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
  if (pesertaErr) throw new Error("Gagal menghapus data peserta: " + pesertaErr.message);

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

// ── Peserta ──────────────────────────────────────────────
export async function getPeserta(
  params: {
    batch_name?: string;
    tim?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
  accessibleIds?: string[] | null,
): Promise<{ data: ProfilerPeserta[]; total: number }> {
  let query = supabaseAdmin
    .from("profiler_peserta")
    .select("*", { count: "exact" });

  if (accessibleIds !== null && accessibleIds !== undefined) {
    if (accessibleIds.length === 0) return { data: [], total: 0 };
    query = query.in("id", accessibleIds);
  }

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

export async function getPesertaById(
  id: string,
  accessibleIds?: string[] | null,
): Promise<ProfilerPeserta> {
  if (
    accessibleIds !== null &&
    accessibleIds !== undefined &&
    !accessibleIds.includes(id)
  ) {
    throw new Error("Peserta tidak ditemukan");
  }

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
  accessibleIds?: string[] | null,
): Promise<ProfilerPeserta[]> {
  return fetchAllPages<ProfilerPeserta>({
    build: ({ from, to }) => {
      let q = supabaseAdmin
        .from("profiler_peserta")
        .select("*")
        .eq("batch_name", batchName)
        .order("nomor_urut")
        .order("nama")
        .range(from, to);

      if (accessibleIds !== null && accessibleIds !== undefined) {
        if (accessibleIds.length === 0) {
          return Promise.resolve({ data: [], error: null });
        }
        q = q.in("id", accessibleIds);
      }

      return q;
    },
  });
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
  const isFotoValid = await checkProfilerPhotoUrl(peserta.foto_url);
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
    const isFotoValid = await checkProfilerPhotoUrl(updates.foto_url);
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
    const existing = await fetchAllPages<{ batch_name: string; nama: string }>({
      build: ({ from, to }) =>
        supabaseAdmin
          .from("profiler_peserta")
          .select("batch_name, nama")
          .in("batch_name", batchNames)
          .range(from, to),
    });

    for (const p of existing) {
      if (!existingNamesByBatch[p.batch_name]) {
        existingNamesByBatch[p.batch_name] = new Set();
      }
      existingNamesByBatch[p.batch_name].add(p.nama.toLowerCase().trim());
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
): Promise<ProfilerPeserta[]> {
  const { data: sourcePeserta } = await supabaseAdmin
    .from("profiler_peserta")
    .select("*")
    .in("id", pesertaIds);

  if (!sourcePeserta || sourcePeserta.length === 0)
    throw new Error("Peserta tidak ditemukan");

  const existingPeserta = await fetchAllPages<{ nama: string }>({
    build: ({ from, to }) =>
      supabaseAdmin
        .from("profiler_peserta")
        .select("nama")
        .eq("batch_name", targetBatchName)
        .range(from, to),
  });

  const existingNames = new Set(
    existingPeserta.map((p) => p.nama.toLowerCase().trim()),
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
  return data ?? [];
}

function mapReorderError(message: string): Error {
  const lower = message.toLowerCase();
  if (
    lower.includes("unauthorized") ||
    lower.includes("akses ditolak") ||
    lower.includes("permission denied")
  ) {
    return new Error("Konfigurasi reorder belum sinkron. Hubungi administrator.");
  }
  if (
    lower.includes("duplikat") ||
    lower.includes("payload reorder tidak valid") ||
    lower.includes("invalid")
  ) {
    return new Error("Payload urutan tidak valid. Muat ulang data lalu coba lagi.");
  }
  if (lower.includes("tidak ditemukan") || lower.includes("tidak ter-update")) {
    return new Error("Sebagian peserta tidak ditemukan. Muat ulang folder lalu coba lagi.");
  }
  return new Error(message || "Gagal menyimpan urutan peserta");
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
    throw mapReorderError(error.message);
  }
}

export async function bulkReorderPeserta(
  updates: { id: string; nomor_urut: number }[],
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("bulk_reorder_profiler_peserta", {
    p_updates: updates,
  });
  if (error) {
    throw mapReorderError(error.message);
  }
}

export async function movePesertaToBatch(
  pesertaIds: string[],
  targetBatchName: string,
): Promise<number> {
  if (pesertaIds.length === 0) return 0;
  const { error } = await supabaseAdmin
    .from("profiler_peserta")
    .update({ batch_name: targetBatchName })
    .in("id", pesertaIds);
  if (error) throw new Error("Gagal memindahkan peserta: " + error.message);
  return pesertaIds.length;
}

export async function getGlobalPesertaPool(
  excludeBatch?: string,
  accessibleIds?: string[] | null,
): Promise<ProfilerPeserta[]> {
  return fetchAllPages<ProfilerPeserta>({
    build: ({ from, to }) => {
      let q = supabaseAdmin
        .from("profiler_peserta")
        .select("*")
        .order("batch_name")
        .order("nama")
        .range(from, to);

      if (accessibleIds !== null && accessibleIds !== undefined) {
        if (accessibleIds.length === 0) {
          return Promise.resolve({ data: [], error: null });
        }
        q = q.in("id", accessibleIds);
      }

      if (excludeBatch) q = q.neq("batch_name", excludeBatch);

      return q;
    },
  });
}

// ── Teams ────────────────────────────────────────────────
export async function getTeams(
  accessibleIds?: string[] | null,
): Promise<ProfilerTim[]> {
  if (accessibleIds !== null && accessibleIds !== undefined) {
    if (accessibleIds.length === 0) return [];
    const { data: scopedTimRows } = await supabaseAdmin
      .from("profiler_peserta")
      .select("tim")
      .in("id", accessibleIds);
    const scopedTims = [
      ...new Set((scopedTimRows ?? []).map((r) => r.tim).filter(Boolean)),
    ] as string[];
    const { data } = await supabaseAdmin
      .from("profiler_tim_list")
      .select("*")
      .in("nama", scopedTims)
      .order("nama");
    return data ?? [];
  }

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
export async function getFolderCounts(
  accessibleIds?: string[] | null,
): Promise<Record<string, number>> {
  const data = await fetchAllPages<{ batch_name: string }>({
    build: ({ from, to }) => {
      let q = supabaseAdmin
        .from("profiler_peserta")
        .select("batch_name")
        .range(from, to);

      if (accessibleIds !== null && accessibleIds !== undefined) {
        if (accessibleIds.length === 0) {
          return Promise.resolve({ data: [], error: null });
        }
        q = q.in("id", accessibleIds);
      }

      return q;
    },
  });

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.batch_name] = (counts[row.batch_name] ?? 0) + 1;
  }
  return counts;
}
