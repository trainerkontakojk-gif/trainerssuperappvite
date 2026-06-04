export const PROFILER_PHOTO_BUCKET = "profiler-foto";
const LEGACY_PROFILER_PHOTO_BUCKETS = ["foto-avatar"] as const;

function getSupabaseStorageUrl(): string {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

export function extractProfilerPhotoPath(fotoUrl: string): string {
  return resolveProfilerPhotoObject(fotoUrl).path;
}

function resolveProfilerPhotoObject(fotoUrl: string): { bucket: string; path: string } {
  const buckets = [PROFILER_PHOTO_BUCKET, ...LEGACY_PROFILER_PHOTO_BUCKETS];
  for (const bucket of buckets) {
    const marker = `/storage/v1/object/public/${bucket}/`;
    if (fotoUrl.startsWith("http") && fotoUrl.includes(marker)) {
      return { bucket, path: fotoUrl.split(marker)[1] ?? "" };
    }
  }
  return { bucket: PROFILER_PHOTO_BUCKET, path: fotoUrl.replace(/^\/+/, "") };
}

export async function checkProfilerPhotoUrl(fotoUrl: string | null | undefined): Promise<boolean> {
  if (!fotoUrl) return true;
  const supabaseUrl = getSupabaseStorageUrl();
  if (!supabaseUrl) return true;

  const { bucket, path } = resolveProfilerPhotoObject(fotoUrl);
  if (!path) return false;

  const url = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    return response.status !== 404;
  } catch {
    return true;
  }
}
