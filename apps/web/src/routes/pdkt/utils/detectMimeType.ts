/**
 * Utility untuk mendeteksi MIME type dari base64 string gambar.
 */

export function getImageDataUri(base64: string): string {
  if (base64.startsWith('data:image/')) {
    return base64;
  }

  const mimeType = detectMimeFromBytes(base64);
  return `data:${mimeType};base64,${base64}`;
}

function detectMimeFromBytes(base64: string): string {
  try {
    const raw = atob(base64.slice(0, 16));
    const bytes = Array.from(raw, (c) => c.charCodeAt(0));

    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
    // PNG: 89 50 4E 47
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return 'image/png';
    }
    // WebP: 52 49 46 46 (RIFF header)
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46
    ) {
      return 'image/webp';
    }
    // GIF: 47 49 46 38
    if (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38
    ) {
      return 'image/gif';
    }
  } catch {
    // ignore
  }

  return 'image/png';
}
