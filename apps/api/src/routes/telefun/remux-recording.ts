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
 * Build a versioned seekable path from an original recording path.
 * Example: "u1/session-1/full_call.webm" → "u1/session-1/full_call.seekable.webm"
 */
export function buildSeekablePath(originalPath: string): string {
  if (originalPath.endsWith(".seekable.webm")) return originalPath;
  const dot = originalPath.lastIndexOf(".");
  if (dot === -1) return `${originalPath}.seekable.webm`;
  return `${originalPath.slice(0, dot)}.seekable.webm`;
}

/**
 * POST /telefun/remux-recording/:sessionId
 *
 * Downloads WebM recordings from Supabase Storage, remuxes them with FFmpeg
 * (lossless container rewrite — no re-encoding), and writes versioned seekable
 * copies (full_call.seekable.webm / agent_only.seekable.webm).
 *
 * After successful upload, updates DB paths atomically and removes old files.
 *
 * Auth: User JWT (must own the session).
 * FFmpeg: Must be installed in the deployment container.
 */
telefunRemuxRecording.post("/remux-recording/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const user = c.get("user");
  const adminClient = createAdminClient();

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

  async function processOne(originalPath: string): Promise<{
    originalPath: string;
    seekablePath: string;
    remuxed: boolean;
    created: boolean;
    error?: string;
  }> {
    const seekablePath = buildSeekablePath(originalPath);
    if (seekablePath === originalPath) {
      return { originalPath, seekablePath, remuxed: true, created: false };
    }

    const { data: urlData, error: urlError } = await adminClient.storage
      .from("telefun-recordings")
      .createSignedUrl(originalPath, 3600);

    if (urlError || !urlData?.signedUrl) {
      return {
        originalPath,
        seekablePath,
        remuxed: false,
        created: false,
        error: `Gagal membuat signed URL: ${urlError?.message}`,
      };
    }

    const response = await fetch(urlData.signedUrl);
    if (!response.ok) {
      return {
        originalPath,
        seekablePath,
        remuxed: false,
        created: false,
        error: `Gagal download: ${response.status}`,
      };
    }

    const inputBuffer = Buffer.from(await response.arrayBuffer());
    const seekableBuffer = await remuxWebM(inputBuffer);

    const { error: uploadError } = await adminClient.storage
      .from("telefun-recordings")
      .upload(seekablePath, seekableBuffer, {
        contentType: "audio/webm",
        upsert: true,
      });

    if (uploadError) {
      return {
        originalPath,
        seekablePath,
        remuxed: false,
        created: false,
        error: `Gagal upload: ${uploadError.message}`,
      };
    }

    return { originalPath, seekablePath, remuxed: true, created: true };
  }

  try {
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

    // 2. Process each recording — independent, collect results
    const sourcePaths = [
      { field: "recording_path" as const, path: session.recording_path },
      { field: "agent_recording_path" as const, path: session.agent_recording_path },
    ].filter((e) => e.path) as { field: "recording_path" | "agent_recording_path"; path: string }[];

    const results = await Promise.all(
      sourcePaths.map((sp) => processOne(sp.path)),
    );

    const allRemuxed = results.every((r) => r.remuxed);
    const anyRemuxed = results.some((r) => r.remuxed);

    // 3. Update DB paths only for successful remuxes
    if (anyRemuxed) {
      const dbUpdate: Record<string, string> = {};
      const toDelete: string[] = [];

      for (const r of results) {
        if (!r.remuxed || !r.created) continue;
        const sourceIdx = sourcePaths.findIndex((sp) => sp.path === r.originalPath);
        if (sourceIdx === -1) continue;
        const field = sourcePaths[sourceIdx].field;

        // Build alternate field name: recording_path → seekable_recording_path
        const seekableField = field === "recording_path"
          ? "recording_path"
          : "agent_recording_path";
        dbUpdate[seekableField] = r.seekablePath;
        toDelete.push(r.originalPath);
      }

      if (Object.keys(dbUpdate).length > 0) {
        const { error: updateError } = await adminClient
          .from("telefun_history")
          .update(dbUpdate)
          .eq("id", sessionId);

        if (updateError) {
          const uploadedPaths = results
            .filter((result) => result.created)
            .map((result) => result.seekablePath);
          if (uploadedPaths.length > 0) {
            await adminClient.storage
              .from("telefun-recordings")
              .remove(uploadedPaths);
          }
          return c.json(
            {
              success: false,
              error: { code: "DB_UPDATE_FAILED", message: updateError.message },
            },
            500,
          );
        }

        // 4. Remove old source files after DB update succeeds (best-effort)
        if (toDelete.length > 0) {
          const { error: removeError } = await adminClient.storage
            .from("telefun-recordings")
            .remove(toDelete);
          if (removeError) {
            console.warn("[Telefun] Failed to remove original recordings:", removeError);
          }
        }
      }
    }

    // 5. Build standardized recordings map
    const recordings: Record<string, { originalPath: string; seekablePath?: string; remuxed: boolean }> = {};
    for (const r of results) {
      recordings[r.originalPath] = {
        originalPath: r.originalPath,
        seekablePath: r.remuxed ? r.seekablePath : undefined,
        remuxed: r.remuxed,
      };
    }

    return c.json({
      success: true,
      data: {
        remuxed: allRemuxed,
        recordings,
      },
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
