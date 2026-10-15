import type { TelefunTranscriptEntry } from "@trainers/types";

/**
 * Analisis rekaman Telaah di browser: selubung kekerasan suara per 20 ms
 * untuk gelombang di pemutar dan untuk mencari awal ucapan tiap baris.
 */

export const FRAME_MS = 20;
/** Laju sampel dekode: cukup untuk kekerasan suara, hemat memori. */
const DECODE_RATE = 8000;
/** Jeda lebih pendek dari ini masih dianggap satu ucapan. */
const MERGE_GAP_MS = 500;
/** Bunyi lebih pendek dari ini (klik, napas) bukan ucapan. */
const MIN_SPEECH_MS = 200;
/** Waktu baris tercatat paling lambat sekian setelah ucapannya mulai. */
const MAX_LAG_MS = 20_000;
/** Ucapan yang mulai sedikit setelah waktu tercatat masih milik baris itu. */
const MAX_LEAD_MS = 1_000;
/** Putar sedikit sebelum ucapan supaya kata pertama tidak terpotong. */
const PRE_ROLL_MS = 200;

/** Kekerasan suara (RMS) per bingkai `FRAME_MS`. */
export type AudioEnvelope = Float32Array;

export async function decodeEnvelope(
  url: string,
  signal: AbortSignal,
): Promise<AudioEnvelope> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`recording ${response.status}`);
  const data = await response.arrayBuffer();
  const context = new OfflineAudioContext(1, 1, DECODE_RATE);
  const audio = await context.decodeAudioData(data);
  const frame = Math.round((audio.sampleRate * FRAME_MS) / 1000);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) =>
    audio.getChannelData(index),
  );
  const envelope = new Float32Array(Math.ceil(audio.length / frame));
  for (let f = 0; f < envelope.length; f += 1) {
    const end = Math.min(audio.length, (f + 1) * frame);
    let sum = 0;
    for (let i = f * frame; i < end; i += 1) {
      let sample = 0;
      for (const channel of channels) sample += channel[i];
      sample /= channels.length;
      sum += sample * sample;
    }
    envelope[f] = Math.sqrt(sum / Math.max(1, end - f * frame));
  }
  return envelope;
}

function quantile(values: AudioEnvelope, q: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** Bingkai bersuara; `null` bila rekaman senyap seluruhnya. */
function activeFrames(envelope: AudioEnvelope): boolean[] | null {
  if (envelope.length === 0) return null;
  const noise = quantile(envelope, 0.1);
  const peak = quantile(envelope, 0.995);
  if (peak < 0.01 || peak - noise < 0.005) return null;
  const threshold = noise + (peak - noise) * 0.1;
  return Array.from(envelope, (value) => value > threshold);
}

interface Span {
  startMs: number;
  endMs: number;
}

function spans(active: readonly boolean[]): Span[] {
  const result: Span[] = [];
  let start = -1;
  active.forEach((on, index) => {
    if (on && start < 0) start = index;
    if (!on && start >= 0) {
      result.push({ startMs: start * FRAME_MS, endMs: index * FRAME_MS });
      start = -1;
    }
  });
  if (start >= 0)
    result.push({ startMs: start * FRAME_MS, endMs: active.length * FRAME_MS });
  const merged: Span[] = [];
  for (const span of result) {
    const last = merged.at(-1);
    if (last && span.startMs - last.endMs < MERGE_GAP_MS)
      last.endMs = span.endMs;
    else merged.push({ ...span });
  }
  return merged.filter((span) => span.endMs - span.startMs >= MIN_SPEECH_MS);
}

/**
 * Awal ucapan tiap baris transkrip (kunci: `startMs` tercatat). Ucapan agen
 * dibaca dari rekaman agen saja; ucapan konsumen adalah bunyi rekaman gabungan
 * saat agen diam. Tiap baris mengambil ucapan pertama pembicaranya yang belum
 * dipakai dan mulai sebelum waktu tercatat; bila tidak ada, waktu tercatat
 * dipakai apa adanya.
 */
export function speechOnsets(
  transcript: readonly TelefunTranscriptEntry[],
  full: AudioEnvelope,
  agent: AudioEnvelope,
): Map<number, number> {
  const onsets = new Map<number, number>();
  const fullActive = activeFrames(full);
  const agentActive = activeFrames(agent);
  if (!fullActive || !agentActive) return onsets;

  // Sisa suara agen di rekaman gabungan tidak dihitung sebagai konsumen.
  const pad = Math.round(100 / FRAME_MS);
  const agentNear = (index: number) =>
    agentActive.slice(Math.max(0, index - pad), index + pad + 1).some(Boolean);
  const bySpeaker = {
    agent: spans(agentActive),
    consumer: spans(fullActive.map((on, index) => on && !agentNear(index))),
  };
  const cursor = { agent: 0, consumer: 0 };

  for (const entry of transcript) {
    if (onsets.has(entry.startMs)) continue;
    const list = bySpeaker[entry.speaker];
    let index = cursor[entry.speaker];
    while (
      index < list.length &&
      list[index].endMs < entry.startMs - MAX_LAG_MS
    )
      index += 1;
    const span = list[index];
    if (!span || span.startMs > entry.startMs + MAX_LEAD_MS) continue;
    onsets.set(entry.startMs, Math.max(0, span.startMs - PRE_ROLL_MS));
    index += 1;
    while (index < list.length && list[index].startMs <= entry.startMs)
      index += 1;
    cursor[entry.speaker] = index;
  }
  return onsets;
}

/** Tinggi batang gelombang 0–1 untuk `count` batang. */
export function waveformBars(envelope: AudioEnvelope, count: number): number[] {
  if (envelope.length === 0 || count <= 0) return [];
  const peak = quantile(envelope, 0.99) || 1;
  const bucket = envelope.length / count;
  return Array.from({ length: count }, (_, bar) => {
    let max = 0;
    const end = Math.min(envelope.length, Math.ceil((bar + 1) * bucket));
    for (let i = Math.floor(bar * bucket); i < end; i += 1)
      max = Math.max(max, envelope[i]);
    return Math.min(1, Math.sqrt(max / peak));
  });
}
