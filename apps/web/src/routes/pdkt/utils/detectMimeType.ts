/**
 * Utility untuk mendeteksi MIME type dari base64 string lampiran.
 */

export function getAttachmentDataUri(base64: string): string {
  if (base64.startsWith("data:")) {
    return base64;
  }

  const mimeType = detectMimeFromBytes(base64);
  return `data:${mimeType};base64,${base64}`;
}

export function isPdfAttachment(base64: string): boolean {
  return getAttachmentDataUri(base64).startsWith("data:application/pdf");
}

export function getPdfBlob(base64: string): Blob | null {
  if (!isPdfAttachment(base64)) return null;

  try {
    const payload = base64.startsWith("data:")
      ? base64.slice(base64.indexOf(",") + 1)
      : base64;
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new Blob([bytes], { type: "application/pdf" });
  } catch {
    return null;
  }
}

export function getImageDataUri(base64: string): string {
  return getAttachmentDataUri(base64);
}

function detectMimeFromBytes(base64: string): string {
  try {
    if (base64.startsWith("data:application/pdf")) {
      return "application/pdf";
    }

    const raw = atob(base64.slice(0, 16));
    const bytes = Array.from(raw, (c) => c.charCodeAt(0));

    // PDF: 25 50 44 46 (%PDF)
    if (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    ) {
      return "application/pdf";
    }
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    // PNG: 89 50 4E 47
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return "image/png";
    }
    // WebP: 52 49 46 46 (RIFF header)
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46
    ) {
      return "image/webp";
    }
    // GIF: 47 49 46 38
    if (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38
    ) {
      return "image/gif";
    }
  } catch {
    // ignore
  }

  return "image/png";
}
