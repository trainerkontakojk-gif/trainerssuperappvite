/**
 * FFmpeg utility for remuxing WebM recordings to make them seekable.
 *
 * Problem: MediaRecorder with timeslice (start(1000)) produces WebM chunks
 * that when concatenated lose seek metadata (cue points, duration, cluster layout).
 *
 * Solution: Download the broken WebM from Supabase → remux with FFmpeg → re-upload.
 *
 * Requirements: FFmpeg must be installed in the deployment container.
 *   - Railway: Set RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg
 *   - Or add to railpack.json: { "deploy": { "aptPackages": ["ffmpeg"] } }
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);

const TMP_DIR = "/tmp";

/**
 * Check if FFmpeg is available in the system.
 * Returns the FFmpeg version string or null if not found.
 */
export async function checkFFmpegAvailable(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"]);
    return stdout.split("\n")[0]; // First line has version info
  } catch {
    return null;
  }
}

/**
 * Remux a WebM buffer to produce a seekable WebM file.
 *
 * Uses `ffmpeg -c copy` which does NOT re-encode — it only rewrites the
 * container metadata (EBML header, cues, duration) so the file is seekable.
 *
 * @param inputBuffer - The raw WebM buffer (from MediaRecorder chunks)
 * @returns A new Buffer containing the seekable WebM file
 */
export async function remuxWebM(inputBuffer: Buffer): Promise<Buffer> {
  const id = randomBytes(8).toString("hex");
  const inputPath = join(TMP_DIR, `telefun_input_${id}.webm`);
  const outputPath = join(TMP_DIR, `telefun_output_${id}.webm`);

  try {
    // Write input buffer to temp file
    await writeFile(inputPath, inputBuffer);

    // Remux with FFmpeg — copy codec, fix container metadata
    // -c copy: no re-encoding (fast, lossless)
    // -movflags +faststart: move metadata to beginning (not for WebM, but harmless)
    // -fflags +genpts: generate PTS if missing
    await execFileAsync("ffmpeg", [
      "-y",                    // Overwrite output
      "-i", inputPath,         // Input file
      "-c", "copy",            // No re-encoding
      "-fflags", "+genpts",    // Generate timestamps if missing
      "-f", "webm",            // Force WebM format
      outputPath,              // Output file
    ], { timeout: 30_000 }); // 30s timeout

    // Read the remuxed file
    const outputBuffer = await readFile(outputPath);
    return outputBuffer;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`FFmpeg remux failed: ${msg}`, { cause: error });
  } finally {
    // Cleanup temp files (ignore errors)
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Full pipeline: download WebM from Supabase → remux → return seekable buffer.
 * Useful for post-upload processing.
 */
export async function downloadAndRemux(params: {
  downloadUrl: string;
}): Promise<Buffer> {
  const response = await fetch(params.downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download recording: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);
  return remuxWebM(inputBuffer);
}
