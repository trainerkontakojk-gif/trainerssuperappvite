import type { NonverbalClipKind } from "./toneDirector";

const CLIP_KINDS_BY_TYPE: Record<string, readonly NonverbalClipKind[]> = {
  marah: ["sigh", "groan", "tsk", "pff", "exhale"],
  pasrah: ["sniffle", "sob", "whimper"],
};

const VARIANTS = [1, 2] as const;
const SAMPLE_RATE_HZ = 24_000;
const FETCH_TIMEOUT_MS = 5_000;

export function getNonverbalClipKinds(
  consumerTypeId: string,
): readonly NonverbalClipKind[] {
  return CLIP_KINDS_BY_TYPE[consumerTypeId] ?? [];
}

export function getNonverbalClipUrl(
  voiceName: string,
  kind: NonverbalClipKind,
  variant: 1 | 2,
): string {
  if (!/^[a-z0-9_-]+$/iu.test(voiceName)) {
    throw new Error("Nama suara klip nonverbal tidak valid.");
  }
  return `/telefun/nonverbal/${voiceName.toLowerCase()}/${kind}-${variant}.wav`;
}

export function parsePcm16MonoWav(wav: ArrayBuffer): Uint8Array {
  if (wav.byteLength < 12) throw new Error("Header WAV terpotong.");
  const view = new DataView(wav);
  const readFourCC = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );

  if (readFourCC(0) !== "RIFF" || readFourCC(8) !== "WAVE") {
    throw new Error("Berkas bukan WAV RIFF.");
  }
  const riffEnd = view.getUint32(4, true) + 8;
  if (riffEnd > wav.byteLength || riffEnd < 12) {
    throw new Error("Ukuran WAV tidak valid.");
  }

  let format: {
    encoding: number;
    channels: number;
    sampleRate: number;
    byteRate: number;
    blockAlign: number;
    bitsPerSample: number;
  } | null = null;
  let dataOffset = -1;
  let dataSize = 0;

  for (let offset = 12; offset + 8 <= riffEnd; ) {
    const chunkId = readFourCC(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > riffEnd) throw new Error("Chunk WAV terpotong.");

    if (chunkId === "fmt ") {
      if (chunkSize < 16) throw new Error("Format WAV tidak lengkap.");
      format = {
        encoding: view.getUint16(chunkStart, true),
        channels: view.getUint16(chunkStart + 2, true),
        sampleRate: view.getUint32(chunkStart + 4, true),
        byteRate: view.getUint32(chunkStart + 8, true),
        blockAlign: view.getUint16(chunkStart + 12, true),
        bitsPerSample: view.getUint16(chunkStart + 14, true),
      };
    } else if (chunkId === "data") {
      dataOffset = chunkStart;
      dataSize = chunkSize;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (
    !format ||
    format.encoding !== 1 ||
    format.channels !== 1 ||
    format.sampleRate !== SAMPLE_RATE_HZ ||
    format.byteRate !== SAMPLE_RATE_HZ * 2 ||
    format.blockAlign !== 2 ||
    format.bitsPerSample !== 16 ||
    dataOffset < 0 ||
    dataSize === 0 ||
    dataSize % 2 !== 0
  ) {
    throw new Error("WAV harus PCM16 mono 24 kHz.");
  }
  return new Uint8Array(wav, dataOffset, dataSize);
}

export async function prefetchNonverbalClips(
  voiceName: string,
  consumerTypeId: string,
): Promise<Map<string, Uint8Array>> {
  const kinds = getNonverbalClipKinds(consumerTypeId);
  if (kinds.length === 0) return new Map();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const clips = await Promise.all(
      kinds.flatMap((kind) =>
        VARIANTS.map(async (variant) => {
          const response = await fetch(getNonverbalClipUrl(voiceName, kind, variant), {
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`Klip nonverbal tidak tersedia (HTTP ${response.status}).`);
          }
          const pcm = parsePcm16MonoWav(await response.arrayBuffer());
          return [`${kind}-${variant}`, pcm] as const;
        }),
      ),
    );
    return new Map(clips);
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
