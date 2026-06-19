import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabase";
import {
  checkFFmpegAvailable,
  remuxWebM,
} from "../../lib/telefun-ffmpeg";

type Variables = { user: User; profile: any };

const telefunRemuxRecording = new Hono<{ Variables: Variables }>();

/**
 * POST /telefun/remux-recording/:sessionId
 *
 * Downloads WebM recordings from Supabase Storage, remuxes them with FFmpeg
 * (lossless container rewrite — no re-encoding), and overwrites the originals.
 *
 * This makes recordings seekable by fixing the WebM container metadata
 * (EBML header, cue points, duration) that MediaRecorder timeslice chunks lose.
 *
 * Auth: User JWT (must own the session).
 * FFmpeg: Must be installed in the deployment container (RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg).
 */
telefunRemuxRecording.post("/remux-recording/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const user = c.get("user");
  const adminClient = createAdminClient();

  // Check FFmpeg availability first
  const ffmpegVersion = await checkFFmpegAvailable();
  if (!ffmpegVersion) {
    return c.json(
      {
        success: false,
        error: {
          code: "FFMPEG_NOT_FOUND",
          message: "FFmpeg tidak tersedia di server.",
        },
      },
      501,
    );
  }

  try {
    // 1. Fetch session and verify ownership
    const { data: session, error: sessionError } = await adminClient
      .from("telefun_history")
      .select("user_id, recording_path, agent_recording_path")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." },
        },
        404,
      );
    }

    if (session.user_id !== user.id) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Anda tidak memiliki akses.",
          },
        },
        403,
      );
    }

    if (!session.recording_path && !session.agent_recording_path) {
      return c.json(
        {
          success: false,
          error: {
            code: "NO_RECORDINGS",
            message: "Tidak ada rekaman untuk diremux.",
          },
        },
        404,
      );
    }

    // 2. Download, remux, and re-upload each recording
    const results: { path: string; remuxed: boolean; error?: string }[] = [];

    for (const recordingPath of [
      session.recording_path,
      session.agent_recording_path,
    ].filter(Boolean) as string[]) {
      try {
        // Download from Supabase Storage
        const { data: urlData, error: urlError } = await adminClient.storage
          .from("telefun-recordings")
          .createSignedUrl(recordingPath, 3600);

        if (urlError || !urlData?.signedUrl) {
          results.push({
            path: recordingPath,
            remuxed: false,
            error: `Gagal membuat signed URL: ${urlError?.message}`,
          });
          continue;
        }

        const response = await fetch(urlData.signedUrl);
        if (!response.ok) {
          results.push({
            path: recordingPath,
            remuxed: false,
            error: `Gagal download: ${response.status}`,
          });
          continue;
        }

        const inputBuffer = Buffer.from(await response.arrayBuffer());

        // Remux with FFmpeg (lossless, no re-encoding)
        const seekableBuffer = await remuxWebM(inputBuffer);

        // Overwrite the original file
        const { error: uploadError } = await adminClient.storage
          .from("telefun-recordings")
          .upload(recordingPath, seekableBuffer, {
            contentType: "audio/webm",
            upsert: true,
          });

        if (uploadError) {
          results.push({
            path: recordingPath,
            remuxed: false,
            error: `Gagal upload: ${uploadError.message}`,
          });
          continue;
        }

        results.push({ path: recordingPath, remuxed: true });
      } catch (err) {
        results.push({
          path: recordingPath,
          remuxed: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const allRemuxed = results.every((r) => r.remuxed);
    const anyRemuxed = results.some((r) => r.remuxed);

    return c.json({
      success: true,
      remuxed: allRemuxed,
      results,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Remux processing error.";
    return c.json(
      {
        success: false,
        error: { code: "REMUX_ERROR", message },
      },
      500,
    );
  }
});

export { telefunRemuxRecording };
