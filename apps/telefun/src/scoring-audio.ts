import { execFile } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import { queryClaimedProcessingSession } from "./db.js";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export const MAX_WEBM_INPUT_BYTES = 50 * 1024 * 1024;
export const MAX_PCM_OUTPUT_BYTES = 200 * 1024 * 1024;

export interface OpenAIScoringInput {
  scenarioTitle: string;
  agentRecordingPath: string;
  audio: Buffer;
}

export class ScoringInputError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ScoringInputError";
    this.code = code;
  }
}

/**
 * Resolve the owned, processing session that exactly matches the evaluator
 * model, then download ONLY the stored agent recording. Never downloads for a
 * missing, unowned, non-processing, or model-mismatched session.
 */
export async function getOpenAIScoringInput({
  sessionId,
  userId,
  modelId,
}: {
  sessionId: string;
  userId: string;
  modelId: string;
}): Promise<OpenAIScoringInput> {
  const session = await queryClaimedProcessingSession(
    sessionId,
    userId,
    modelId,
  );

  if (!session) {
    throw new ScoringInputError(
      "Session tidak ditemukan, bukan milik user, bukan status processing, atau model tidak cocok.",
      "MODEL_MISMATCH",
    );
  }
  if (session.scoring_status !== "processing") {
    throw new ScoringInputError(
      `Status sesi tidak valid: ${session.scoring_status}`,
      "INVALID_STATUS",
    );
  }
  if (session.telefun_model_id !== modelId) {
    throw new ScoringInputError(
      "Model evaluator tidak cocok dengan sesi.",
      "MODEL_MISMATCH",
    );
  }
  if (!session.agent_recording_path) {
    throw new ScoringInputError(
      "Tidak ada rekaman agen untuk dinilai.",
      "NO_RECORDING",
    );
  }

  const { data, error } = await admin.storage
    .from("telefun-recordings")
    .download(session.agent_recording_path);

  if (error || !data) {
    throw new ScoringInputError(
      `Gagal mengunduh rekaman: ${error?.message ?? "unknown"}`,
      "DOWNLOAD_FAILED",
    );
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.byteLength > MAX_WEBM_INPUT_BYTES) {
    throw new ScoringInputError(
      "Rekaman agen melebihi batas ukuran.",
      "TOO_LARGE",
    );
  }

  return {
    scenarioTitle: session.scenario_title,
    agentRecordingPath: session.agent_recording_path,
    audio: buffer,
  };
}

/**
 * Convert WebM (agent audio) to signed 16-bit PCM mono at 24 kHz via FFmpeg.
 * Uses a random temp file and always unlinks both input and output.
 */
export function convertWebMToPcm24kMono(input: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    if (input.byteLength > MAX_WEBM_INPUT_BYTES) {
      reject(
        new ScoringInputError(
          "Rekaman agen melebihi batas ukuran.",
          "TOO_LARGE",
        ),
      );
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "telefun-score-"));
    const inPath = join(dir, `${randomUUID()}.webm`);
    const outPath = join(dir, `${randomUUID()}.pcm`);
    writeFileSync(inPath, input);

    const onDone = () => {
      try {
        unlinkSync(inPath);
      } catch {
        /* ignore */
      }
      try {
        unlinkSync(outPath);
      } catch {
        /* ignore */
      }
      try {
        rmdirSync(dir);
      } catch {
        /* ignore */
      }
    };

    execFile(
      "ffmpeg",
      ["-y", "-i", inPath, "-ac", "1", "-ar", "24000", "-f", "s16le", outPath],
      { timeout: 30_000, maxBuffer: MAX_PCM_OUTPUT_BYTES },
      (err) => {
        if (err) {
          onDone();
          reject(
            new ScoringInputError(
              `Konversi audio gagal: ${err.message}`,
              "CONVERSION_FAILED",
            ),
          );
          return;
        }
        try {
          const out = readFileSync(outPath);
          if (out.byteLength > MAX_PCM_OUTPUT_BYTES) {
            throw new ScoringInputError(
              "Audio PCM hasil konversi melebihi batas ukuran.",
              "TOO_LARGE",
            );
          }
          onDone();
          resolve(out);
        } catch (readErr) {
          onDone();
          if (readErr instanceof ScoringInputError) {
            reject(readErr);
            return;
          }
          reject(
            new ScoringInputError(
              `Gagal membaca hasil konversi: ${String(readErr)}`,
              "CONVERSION_FAILED",
            ),
          );
        }
      },
    );
  });
}
