/**
 * Unduh rekaman sebagai berkas. Tautan bertanda tangan Supabase berada di
 * origin lain, sehingga atribut `download` diabaikan browser bila dipakai
 * langsung; rekaman diambil dulu lalu diunduh dari tautan blob lokal.
 */
export async function downloadRecording(
  url: string,
  fileName: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`recording ${response.status}`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  // Dicabut belakangan: sebagian browser masih membaca blob sesudah klik.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
