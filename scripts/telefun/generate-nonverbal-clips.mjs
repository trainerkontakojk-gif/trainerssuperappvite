#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { TextDecoder } from "node:util";
import process from "node:process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const MODEL = "gemini-3.8-flash-tts";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const SAMPLE_RATE = 24_000;
const REQUEST_INTERVAL_MS = 7_000;
const MAX_ASSET_BYTES = 3_000_000;
const ANGRY_STYLE = "konsumen yang sedang kesal dan tidak sabar di telepon, tanpa kata";
const SAD_STYLE = "orang yang menahan tangis, napas basah, sengau";

const generatedJobs = [
  ...["Orus", "Alnilam"].flatMap((voice) =>
    [
      ["sigh", "<sigh>"],
      ["groan", "<groan>"],
      ["tsk", "<tsk>"],
      ["pff", "<pff>"],
      ["exhale", "<heavy breath>"],
    ].flatMap(([kind, tag]) =>
      [1, 2].map((variant) => ({
        voice,
        kind,
        tag,
        variant,
        style: ANGRY_STYLE,
        maxSeconds: 1.2,
      })),
    ),
  ),
  ...["sob", "whimper"].flatMap((kind) =>
    [1, 2].map((variant) => ({
      voice: "Algieba",
      kind,
      tag: `<${kind}>`,
      variant,
      style: SAD_STYLE,
      maxSeconds: 2.0,
    })),
  ),
];

const approvedSources = [
  ...["sigh", "groan", "tsk", "pff", "exhale"].flatMap((kind) =>
    [1, 2].map((variant) => ({
      source: `7 Klip marah TTS + Live/Kore-${kind}-r${variant}.wav`,
      voice: "Kore",
      kind,
      variant,
      maxSeconds: 1.2,
    })),
  ),
  ...[1, 2].map((variant) => ({
    source: `6 Sniffle TTS/Kore-2-r${variant}.wav`,
    voice: "Kore",
    kind: "sniffle",
    variant,
    maxSeconds: 2.0,
  })),
  {
    source: "5 Klip tangis TTS + Live/clip-Kore-sob.wav",
    voice: "Kore",
    kind: "sob",
    variant: 1,
    maxSeconds: 2.0,
    trimWithFade: true,
  },
  {
    source: "5 Klip tangis TTS + Live/clip-Kore-whimper.wav",
    voice: "Kore",
    kind: "whimper",
    variant: 1,
    maxSeconds: 2.0,
    trimWithFade: true,
  },
  ...[1, 2].map((variant) => ({
    source: `9 Live sedih - kandidat suara/sniffle-Algieba-r${variant}.wav`,
    voice: "Algieba",
    kind: "sniffle",
    variant,
    maxSeconds: 2.0,
  })),
];

function parseArgs(argv) {
  const preflightOnly = argv[2] === "--preflight-only";
  if (
    (argv.length !== 2 && argv.length !== 3) ||
    (argv.length === 3 && !preflightOnly) ||
    argv[0] !== "--out" ||
    !argv[1]
  ) {
    throw new Error(
      "Pakai: node scripts/telefun/generate-nonverbal-clips.mjs --out <dir> [--preflight-only]",
    );
  }
  return { outDir: resolve(process.cwd(), argv[1]), preflightOnly };
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\s+#.*$/u, "").trim();
}

async function readApiKey() {
  const fromProcess = process.env.GEMINI_API_KEY?.trim();
  if (fromProcess) return fromProcess;

  for (const file of [".env.local", ".env"]) {
    try {
      const contents = await readFile(resolve(REPO_ROOT, file), "utf8");
      for (const line of contents.split(/\r?\n/u)) {
        const match = line.match(/^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*?)\s*$/u);
        if (!match) continue;
        const value = parseEnvValue(match[1]);
        if (value) return value;
      }
    } catch {
      // The next canonical local env file may contain the key.
    }
  }

  throw new Error("GEMINI_API_KEY tidak ditemukan di environment lokal.");
}

function readWav(bytes, label) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`WAV tidak valid: ${label}`);
  }

  let format = null;
  let data = null;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) throw new Error(`Chunk WAV terpotong: ${label}`);
    if (id === "fmt ") {
      format = {
        encoding: bytes.readUInt16LE(start),
        channels: bytes.readUInt16LE(start + 2),
        sampleRate: bytes.readUInt32LE(start + 4),
        bits: bytes.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      data = bytes.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }

  if (
    !format ||
    !data ||
    format.encoding !== 1 ||
    format.channels !== 1 ||
    format.sampleRate !== SAMPLE_RATE ||
    format.bits !== 16 ||
    data.length % 2 !== 0
  ) {
    throw new Error(`WAV harus PCM16 mono 24 kHz: ${label}`);
  }
  return { data, sampleRate: format.sampleRate };
}

function writeWav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function fadeOut(pcm, milliseconds = 80) {
  const samples = pcm.length / 2;
  const fadeSamples = Math.min(samples, Math.round((SAMPLE_RATE * milliseconds) / 1000));
  if (fadeSamples < 2) return pcm;
  const output = Buffer.from(pcm);
  const first = samples - fadeSamples;
  for (let index = first; index < samples; index += 1) {
    const progress = (samples - 1 - index) / (fadeSamples - 1);
    const sample = output.readInt16LE(index * 2);
    output.writeInt16LE(Math.round(sample * progress), index * 2);
  }
  return output;
}

function trimPcm(pcm, maxSeconds, { fadeWhenTrimmed = true } = {}) {
  if (pcm.length % 2 !== 0) throw new Error("PCM16 memiliki jumlah byte ganjil.");
  const totalSamples = pcm.length / 2;
  let firstActive = -1;
  let lastActive = -1;
  for (let index = 0; index < totalSamples; index += 1) {
    if (Math.abs(pcm.readInt16LE(index * 2)) > 400) {
      if (firstActive < 0) firstActive = index;
      lastActive = index;
    }
  }
  if (firstActive < 0) throw new Error("Audio tidak melewati ambang PCM ±400.");

  const padding = Math.round(SAMPLE_RATE * 0.03);
  const start = Math.max(0, firstActive - padding);
  let end = Math.min(totalSamples, lastActive + padding + 1);
  const maxSamples = Math.floor(SAMPLE_RATE * maxSeconds);
  const wasTrimmed = end - start > maxSamples;
  if (wasTrimmed) end = start + maxSamples;
  let result = Buffer.from(pcm.subarray(start * 2, end * 2));
  if (wasTrimmed && fadeWhenTrimmed) result = fadeOut(result);
  return { pcm: result, wasTrimmed };
}

function zeroCrossingRate(pcm, bigEndian) {
  const count = Math.floor(pcm.length / 2);
  if (count < 2) return 0;
  let previousNegative = false;
  let crossings = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 2;
    const sample = bigEndian
      ? pcm.readInt16BE(offset)
      : pcm.readInt16LE(offset);
    const negative = sample < 0;
    if (index > 0 && negative !== previousNegative) crossings += 1;
    previousNegative = negative;
  }
  return crossings / (count - 1);
}

function validateClip(bytes, label, maxSeconds) {
  const { data } = readWav(bytes, label);
  const duration = data.length / 2 / SAMPLE_RATE;
  const littleEndianZcr = zeroCrossingRate(data, false);
  const bigEndianZcr = zeroCrossingRate(data, true);
  if (duration <= 0 || duration > maxSeconds + 1 / SAMPLE_RATE) {
    throw new Error(`Durasi klip di luar batas: ${label}`);
  }
  if (!(littleEndianZcr < bigEndianZcr)) {
    throw new Error(`Urutan byte PCM tidak lolos pemeriksaan: ${label}`);
  }
  return { duration, bytes: bytes.length, littleEndianZcr, bigEndianZcr };
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function outputPath(outDir, clip) {
  return resolve(outDir, clip.voice.toLowerCase(), `${clip.kind}-${clip.variant}.wav`);
}

async function copyApprovedClips(outDir) {
  const sourceDir = resolve(homedir(), "Downloads/Telefun Sampel Suara");
  for (const clip of approvedSources) {
    const destination = outputPath(outDir, clip);
    if (await fileExists(destination)) {
      validateClip(await readFile(destination), destination, clip.maxSeconds);
      continue;
    }

    const sourcePath = resolve(sourceDir, clip.source);
    const source = readWav(await readFile(sourcePath), clip.source);
    const prepared = clip.trimWithFade
      ? trimPcm(source.data, clip.maxSeconds)
      : { pcm: source.data, wasTrimmed: false };
    const output = writeWav(prepared.pcm);
    validateClip(output, destination, clip.maxSeconds);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, output, { flag: "wx" });
    const info = validateClip(output, destination, clip.maxSeconds);
    process.stdout.write(
      `Copied ${clip.voice}/${clip.kind}-${clip.variant}.wav ${info.duration.toFixed(3)}s${prepared.wasTrimmed ? " (trimmed, 80ms fade)" : ""}\n`,
    );
  }
}

async function validateApprovedSources() {
  const sourceDir = resolve(homedir(), "Downloads/Telefun Sampel Suara");
  for (const clip of approvedSources) {
    const source = readWav(
      await readFile(resolve(sourceDir, clip.source)),
      clip.source,
    );
    const prepared = clip.trimWithFade
      ? trimPcm(source.data, clip.maxSeconds)
      : { pcm: source.data, wasTrimmed: false };
    validateClip(writeWav(prepared.pcm), clip.source, clip.maxSeconds);
  }
  if (generatedJobs.length !== 24) throw new Error("Jumlah job klip harus tetap 24.");
}

function parseSampleRate(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/rate\s*=\s*(\d+)/iu);
  return match ? Number(match[1]) : null;
}

function extractAudioParts(value) {
  const found = [];
  function visit(item) {
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (!item || typeof item !== "object") return;
    const record = item;
    if (record.type === "audio") {
      const nestedData = record.data && typeof record.data === "object" ? record.data.data : undefined;
      const nestedAudio = record.audio && typeof record.audio === "object" ? record.audio.data : undefined;
      const audio =
        (typeof record.data === "string" && record.data) ||
        (typeof record.audio === "string" && record.audio) ||
        (typeof nestedData === "string" && nestedData) ||
        (typeof nestedAudio === "string" && nestedAudio);
      if (typeof audio === "string") {
        found.push({
          data: audio,
          sampleRate:
            parseSampleRate(record.mime_type) ??
            parseSampleRate(record.mimeType) ??
            (typeof record.sample_rate === "number" ? record.sample_rate : null),
        });
      }
    }
    for (const [key, child] of Object.entries(record)) {
      if ((key === "data" || key === "audio") && typeof child === "string") continue;
      visit(child);
    }
  }
  visit(value);
  return found;
}

function decodeBase64Audio(value) {
  const comma = value.indexOf(",");
  const encoded = value.startsWith("data:") && comma >= 0 ? value.slice(comma + 1) : value;
  return Buffer.from(encoded.replace(/\s+/gu, ""), "base64");
}

async function parseSseAudio(response) {
  if (!response.body) throw new Error("TTS tidak mengembalikan stream audio.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const startChunks = [];
  const deltaChunks = [];
  let pending = "";
  let eventName = "";
  let sampleRate = SAMPLE_RATE;

  const consumeFrame = (frame) => {
    let explicitEvent = eventName;
    const payloadLines = [];
    for (const line of frame.split(/\r?\n/u)) {
      if (line.startsWith("event:")) explicitEvent = line.slice(6).trim();
      else if (line.startsWith("data:")) payloadLines.push(line.slice(5).trimStart());
    }
    eventName = "";
    if (payloadLines.length === 0) return;
    const raw = payloadLines.join("\n");
    if (!raw || raw === "[DONE]") return;

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const kind = payload.event || payload.type || explicitEvent;
    let audioValue;
    if (kind === "step.delta") audioValue = payload.delta;
    else if (kind === "step.start") {
      const step = payload.step && typeof payload.step === "object" ? payload.step : payload;
      if (step.type !== "model_output") return;
      audioValue = step.content;
    } else return;

    for (const part of extractAudioParts(audioValue)) {
      if (part.sampleRate) sampleRate = part.sampleRate;
      const bytes = decodeBase64Audio(part.data);
      if (bytes.length > 0) (kind === "step.delta" ? deltaChunks : startChunks).push(bytes);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true }).replace(/\r\n/gu, "\n");
    let boundary = pending.indexOf("\n\n");
    while (boundary >= 0) {
      consumeFrame(pending.slice(0, boundary));
      pending = pending.slice(boundary + 2);
      boundary = pending.indexOf("\n\n");
    }
  }
  pending += decoder.decode();
  if (pending.trim()) consumeFrame(pending);

  const startAudio = Buffer.concat(startChunks);
  const deltaAudio = Buffer.concat(deltaChunks);
  const pcm =
    startAudio.length > 0 &&
    deltaAudio.length >= startAudio.length &&
    deltaAudio.subarray(0, startAudio.length).equals(startAudio)
      ? deltaAudio
      : Buffer.concat([startAudio, deltaAudio]);
  if (pcm.length === 0) throw new Error("TTS stream tidak berisi part audio.");
  if (sampleRate !== SAMPLE_RATE) throw new Error(`Sample rate TTS tidak terduga: ${sampleRate}`);
  return pcm;
}

function retryDelayMs(response, body) {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000);
  const match = body.match(/retry\s+in\s+([\d.]+)\s*(ms|s|sec|seconds)?/iu);
  if (!match) return REQUEST_INTERVAL_MS;
  const value = Number(match[1]);
  return Math.ceil(match[2]?.toLowerCase() === "ms" ? value : value * 1000);
}

let lastRequestAt = 0;
async function waitForRateLimit() {
  const waitMs = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (waitMs > 0) await delay(waitMs);
  lastRequestAt = Date.now();
}

async function requestAudio(job, apiKey) {
  const body = {
    model: MODEL,
    input: [
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text: job.tag,
            annotations: [{ type: "speech_metadata", style: job.style }],
          },
        ],
      },
    ],
    response_format: {
      type: "audio",
      mime_type: "audio/l16",
      sample_rate: SAMPLE_RATE,
    },
    generation_config: { speech_config: [{ voice: job.voice }] },
    stream: true,
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await waitForRateLimit();
    const response = await globalThis.fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: globalThis.AbortSignal.timeout(90_000),
    });
    if (response.status === 429 && attempt === 0) {
      const retryBody = await response.text();
      const delay = Math.max(REQUEST_INTERVAL_MS, retryDelayMs(response, retryBody));
      process.stdout.write(`Rate limit: menunggu ${(delay / 1000).toFixed(1)}s sebelum satu retry.\n`);
      await new Promise((resolvePromise) => globalThis.setTimeout(resolvePromise, delay));
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Permintaan TTS gagal (HTTP ${response.status}).`);
    }
    return parseSseAudio(response);
  }
  throw new Error("Permintaan TTS tetap dibatasi setelah satu retry.");
}

async function generateClips(outDir, apiKey) {
  if (generatedJobs.length !== 24) throw new Error("Jumlah job klip harus tetap 24.");
  let generated = 0;
  for (const [index, job] of generatedJobs.entries()) {
    const destination = outputPath(outDir, job);
    if (await fileExists(destination)) {
      validateClip(await readFile(destination), destination, job.maxSeconds);
      process.stdout.write(`Skipped existing valid ${job.voice}/${job.kind}-${job.variant}.wav\n`);
      continue;
    }

    const sourcePcm = await requestAudio(job, apiKey);
    const prepared = trimPcm(sourcePcm, job.maxSeconds);
    const wav = writeWav(prepared.pcm);
    const info = validateClip(wav, destination, job.maxSeconds);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, wav, { flag: "wx" });
    generated += 1;
    process.stdout.write(
      `[${index + 1}/24] ${job.voice}/${job.kind}-${job.variant}.wav ${info.duration.toFixed(3)}s ${info.bytes}B zcr ${info.littleEndianZcr.toFixed(3)} < ${info.bigEndianZcr.toFixed(3)}${prepared.wasTrimmed ? " (trimmed, 80ms fade)" : ""}\n`,
    );
  }
  return generated;
}

async function validateOutput(outDir) {
  const expected = [
    ...approvedSources.map((clip) => ({ ...clip, path: outputPath(outDir, clip) })),
    ...generatedJobs.map((clip) => ({ ...clip, path: outputPath(outDir, clip) })),
  ];
  const uniquePaths = new Set(expected.map((clip) => clip.path));
  if (uniquePaths.size !== 40) throw new Error("Daftar aset harus menghasilkan 40 file unik.");
  let totalBytes = 0;
  for (const clip of expected) {
    const bytes = await readFile(clip.path);
    const info = validateClip(bytes, clip.path, clip.maxSeconds);
    totalBytes += info.bytes;
  }
  if (totalBytes >= MAX_ASSET_BYTES) throw new Error(`Ukuran aset ${totalBytes}B mencapai batas 3 MB.`);
  process.stdout.write(`Validated 40 WAVs; total ${(totalBytes / 1024 / 1024).toFixed(2)} MiB (< 3 MB).\n`);
}

async function main() {
  const { outDir, preflightOnly } = parseArgs(process.argv.slice(2));
  const apiKey = await readApiKey();
  await validateApprovedSources();
  if (preflightOnly) {
    process.stdout.write("Preflight OK: 16 sumber audio, 24 job TTS, dan key lokal tersedia; tidak ada file ditulis atau panggilan API dibuat.\n");
    return;
  }
  await mkdir(outDir, { recursive: true });
  await copyApprovedClips(outDir);
  const generated = await generateClips(outDir, apiKey);
  await validateOutput(outDir);
  process.stdout.write(`Generated ${generated} new clips with ${MODEL}. API key was not printed.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Pembuatan klip gagal."}\n`);
  process.exitCode = 1;
});
