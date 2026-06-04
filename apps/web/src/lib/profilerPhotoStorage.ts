import { supabase } from "./supabase";

export const PROFILER_PHOTO_BUCKET = "profiler-foto";

export function buildProfilerPhotoPath(pesertaId: string, fileName: string): string {
  const rawExt = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const ext = rawExt || "jpg";
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${pesertaId}/${Date.now()}-${random}.${ext}`;
}

export async function uploadProfilerPhoto(file: File, pesertaId: string): Promise<string> {
  const path = buildProfilerPhotoPath(pesertaId, file.name);
  const { error } = await supabase.storage.from(PROFILER_PHOTO_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) {
    throw new Error(`Gagal upload foto ke storage: ${error.message}`);
  }

  const { data } = supabase.storage.from(PROFILER_PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
