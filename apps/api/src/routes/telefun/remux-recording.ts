import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabase";
import {
  checkFFmpegAvailable,
  remuxWebM,
} from "../../lib/telefun-ffmpeg";
import type {
  TelefunRecordingStatus,
  TelefunScoringStatus,
} from "@trainers/types";

type Variables = { user: User; profile: any };

const telefunRemuxRecording = new Hono<{ Variables: Variables }>();

type StorageOwnership = "created" | "preexisting" | "unknown" | "none";
type ReadinessState =
  | "not_attempted"
  | "persisted"
  | "confirmed-unpersisted"
  | "ambiguous";

type RemuxItem = {
  field: "recording_path" | "agent_recording_path";
  originalPath: string;
  seekablePath: string;
  remuxed: boolean;
  storageOwnership: StorageOwnership;
  readiness: ReadinessState;
  error?: string;
};

type RecordingReadinessRpcRow = {
  applied: boolean;
  recording_status: TelefunRecordingStatus;
  recording_ready: boolean;
  scoring_ready: boolean;
  scoring_ready_at?: string | null;
  scoring_status: TelefunScoringStatus;
  reason: string;
};

type RecordingReadbackRow = {
  id: string;
  user_id: string;
  status: string;
  telefun_transport: string | null;
  recording_path: string | null;
  agent_recording_path: string | null;
  recording_status: TelefunRecordingStatus;
  recording_ready_at: string | null;
  recording_error: string | null;
  scoring_ready_at: string | null;
  scoring_status: TelefunScoringStatus;
};

const READBACK_SELECT =
  "id, user_id, status, telefun_transport, recording_path, agent_recording_path, recording_status, recording_ready_at, recording_error, scoring_ready_at, scoring_status";

function firstRpcRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function isOwnedRecordingPath(
  path: string,
  userId: string,
  sessionId: string,
  type: "full_call" | "agent_only",
): boolean {
  return (
    path === `${userId}/${sessionId}/${type}.webm` ||
    path === `${userId}/${sessionId}/${type}.seekable.webm`
  );
}

function isStorageNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; statusCode?: number; message?: string };
  if (candidate.status === 404 || candidate.statusCode === 404) return true;
  return /not found|not exist|no such object|object not found/i.test(
    candidate.message ?? "",
  );
}

function isAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; statusCode?: number; message?: string };
  if (candidate.status === 409 || candidate.statusCode === 409) return true;
  return /already exists|duplicate|exists/i.test(candidate.message ?? "");
}

function isRecordingReadinessRow(value: unknown): value is RecordingReadinessRpcRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<RecordingReadinessRpcRow>;
  return (
    typeof row.applied === "boolean" &&
    typeof row.recording_status === "string" &&
    typeof row.recording_ready === "boolean" &&
    typeof row.scoring_ready === "boolean" &&
    typeof row.scoring_status === "string" &&
    typeof row.reason === "string"
  );
}

function isRecordingReadbackRow(
  value: unknown,
  sessionId: string,
  userId: string,
): value is RecordingReadbackRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<RecordingReadbackRow>;
  return (
    row.id === sessionId &&
    row.user_id === userId &&
    typeof row.status === "string" &&
    (typeof row.telefun_transport === "string" || row.telefun_transport === null) &&
    (typeof row.recording_path === "string" || row.recording_path === null) &&
    (typeof row.agent_recording_path === "string" || row.agent_recording_path === null) &&
    typeof row.recording_status === "string" &&
    (typeof row.recording_ready_at === "string" || row.recording_ready_at === null) &&
    (typeof row.recording_error === "string" || row.recording_error === null) &&
    (typeof row.scoring_ready_at === "string" || row.scoring_ready_at === null) &&
    typeof row.scoring_status === "string"
  );
}

function readinessFailureStatus(reason: string): 400 | 403 | 404 | 409 | 503 {
  if (reason === "session_not_found") return 404;
  if (reason === "not_owner") return 403;
  if (
    reason === "path_conflict" ||
    reason === "session_not_terminal" ||
    reason === "capture_failed" ||
    reason === "recording_failed"
  ) return 409;
  if (reason.startsWith("invalid_") || reason === "recording_required") return 400;
  return 503;
}

function readinessFailureCode(status: 400 | 403 | 404 | 409 | 503): string {
  if (status === 400) return "INVALID_RECORDING_PATH";
  if (status === 403) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "RECORDING_CONFLICT";
  return "RECORDING_STATE_UNAVAILABLE";
}

function readinessFailureMessage(code: string): string {
  switch (code) {
    case "INVALID_RECORDING_PATH":
      return "Path rekaman seekable tidak valid.";
    case "UNAUTHORIZED":
      return "Anda tidak memiliki akses.";
    case "NOT_FOUND":
      return "Sesi tidak ditemukan.";
    case "RECORDING_CONFLICT":
      return "Path rekaman sudah dikunci oleh server.";
    case "RECORDING_RECONCILIATION_AMBIGUOUS":
      return "Status rekaman belum dapat dipastikan. Coba lagi.";
    default:
      return "Status rekaman belum dapat disimpan. Coba lagi.";
  }
}

function normalizeReadbackReadiness(
  row: RecordingReadbackRow,
): RecordingReadinessRpcRow {
  return {
    applied: true,
    recording_status: row.recording_status,
    recording_ready: row.recording_ready_at !== null,
    scoring_ready: row.scoring_ready_at !== null,
    scoring_ready_at: row.scoring_ready_at,
    scoring_status: row.scoring_status,
    reason: "reconciled",
  };
}

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

  async function processOne(
    field: RemuxItem["field"],
    originalPath: string,
  ): Promise<RemuxItem> {
    const seekablePath = buildSeekablePath(originalPath);
    const base = {
      field,
      originalPath,
      seekablePath,
      readiness: "not_attempted" as const,
    };

    if (seekablePath === originalPath) {
      return {
        ...base,
        remuxed: true,
        storageOwnership: "none",
      };
    }

    try {
      const storage = adminClient.storage.from("telefun-recordings");
      const { data: existingData, error: existingError } =
        await storage.createSignedUrl(seekablePath, 60);

      if (existingData?.signedUrl) {
        return {
          ...base,
          remuxed: true,
          storageOwnership: "preexisting",
        };
      }
      if (!isStorageNotFoundError(existingError)) {
        return {
          ...base,
          remuxed: false,
          storageOwnership: "unknown",
          error: "Seekable output presence is unknown",
        };
      }

      const { data: urlData, error: urlError } = await storage.createSignedUrl(
        originalPath,
        3600,
      );
      if (urlError || !urlData?.signedUrl) {
        return {
          ...base,
          remuxed: false,
          storageOwnership: "none",
          error: "Source recording is unavailable",
        };
      }

      const response = await fetch(urlData.signedUrl);
      if (!response.ok) {
        return {
          ...base,
          remuxed: false,
          storageOwnership: "none",
          error: "Source recording download failed",
        };
      }

      const inputBuffer = Buffer.from(await response.arrayBuffer());
      const seekableBuffer = await remuxWebM(inputBuffer);
      const { error: uploadError } = await storage.upload(
        seekablePath,
        seekableBuffer,
        { contentType: "audio/webm", upsert: false },
      );

      if (!uploadError) {
        return {
          ...base,
          remuxed: true,
          storageOwnership: "created",
        };
      }

      if (isAlreadyExistsError(uploadError)) {
        const { data: racedData, error: racedError } =
          await storage.createSignedUrl(seekablePath, 60);
        if (racedData?.signedUrl) {
          return {
            ...base,
            remuxed: true,
            storageOwnership: "preexisting",
          };
        }
        return {
          ...base,
          remuxed: false,
          storageOwnership: "unknown",
          error: racedError ? "Seekable output race is unknown" : "Seekable output was not confirmed",
        };
      }

      return {
        ...base,
        remuxed: false,
        storageOwnership: "unknown",
        error: "Seekable output upload is unknown",
      };
    } catch (_error: unknown) {
      return {
        ...base,
        remuxed: false,
        storageOwnership: "unknown",
        error: "Remux failed",
      };
    }
  }

  try {
    const { data: session, error: sessionError } = await adminClient
      .from("telefun_history")
      .select(
        "user_id, status, telefun_transport, recording_path, agent_recording_path, recording_status, recording_ready_at, scoring_ready_at, scoring_status",
      )
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

    const isWebRtc = session.telefun_transport === "openai-webrtc";
    if (isWebRtc && (session.status === "active" || session.status === "pending")) {
      return c.json(
        {
          success: false,
          error: {
            code: "RECORDING_CONFLICT",
            message: "Path rekaman sudah dikunci oleh server.",
          },
        },
        409,
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

    if (
      sourcePaths.some((source) =>
        !isOwnedRecordingPath(
          source.path,
          user.id,
          sessionId,
          source.field === "recording_path" ? "full_call" : "agent_only",
        ),
      )
    ) {
      return c.json(
        {
          success: false,
          error: {
            code: "INVALID_RECORDING_PATH",
            message: "Path rekaman seekable tidak valid.",
          },
        },
        400,
      );
    }

    const results = await Promise.all(
      sourcePaths.map((source) => processOne(source.field, source.path)),
    );
    const successfulResults = results.filter((result) => result.remuxed);
    const allRemuxed = results.every((result) => result.remuxed);
    const anyRemuxed = successfulResults.length > 0;

    if (!anyRemuxed) {
      return c.json(
        {
          success: false,
          error: { code: "REMUX_ERROR", message: "Remux rekaman gagal." },
        },
        500,
      );
    }

    const removeConfirmedUnpersisted = async () => {
      const paths = successfulResults
        .filter(
          (result) =>
            result.storageOwnership === "created" &&
            result.readiness === "confirmed-unpersisted",
        )
        .map((result) => result.seekablePath);
      if (paths.length === 0) return;
      try {
        const { error } = await adminClient.storage
          .from("telefun-recordings")
          .remove(paths);
        if (error) {
          console.warn("[Telefun] Failed to remove unpersisted seekable outputs");
        }
      } catch (_error: unknown) {
        console.warn("[Telefun] Failed to remove unpersisted seekable outputs");
      }
    };

    const removePersistedOriginals = async () => {
      const paths = successfulResults
        .filter(
          (result) =>
            result.readiness === "persisted" &&
            result.originalPath !== result.seekablePath,
        )
        .map((result) => result.originalPath);
      if (paths.length === 0) return;
      try {
        const { error } = await adminClient.storage
          .from("telefun-recordings")
          .remove(paths);
        if (error) {
          console.warn("[Telefun] Failed to remove original recordings");
        }
      } catch (_error: unknown) {
        console.warn("[Telefun] Failed to remove original recordings");
      }
    };

    // The readiness RPC is deliberately called once for the complete successful
    // sibling batch. No sibling can be cleaned up before this result is known.
    let readiness: RecordingReadinessRpcRow | null = null;
    if (isWebRtc) {
      let rpcData: unknown = null;
      let rpcError: unknown = null;
      try {
        const rpcResult = await adminClient.rpc("mark_telefun_recording_ready", {
          p_session_id: sessionId,
          p_user_id: user.id,
          p_recording_path:
            successfulResults.find((result) => result.field === "recording_path")
              ?.seekablePath ?? null,
          p_agent_recording_path:
            successfulResults.find(
              (result) => result.field === "agent_recording_path",
            )?.seekablePath ?? null,
        });
        rpcData = rpcResult.data;
        rpcError = rpcResult.error;
      } catch (_error: unknown) {
        rpcError = new Error("Readiness RPC unavailable");
      }
      const rpcRow = firstRpcRow(
        rpcData as RecordingReadinessRpcRow | RecordingReadinessRpcRow[] | null,
      );

      if (rpcError || !isRecordingReadinessRow(rpcRow)) {
        let readback: unknown = null;
        let readbackError: unknown = null;
        try {
          const result = await adminClient
            .from("telefun_history")
            .select(READBACK_SELECT)
            .eq("id", sessionId)
            .eq("user_id", user.id)
            .maybeSingle();
          readback = result.data;
          readbackError = result.error;
        } catch (_error: unknown) {
          readbackError = new Error("Recording read-back unavailable");
        }

        if (!readbackError && isRecordingReadbackRow(readback, sessionId, user.id)) {
          let ambiguous = false;
          for (const result of successfulResults) {
            const targetPath = readback[result.field];
            const paths = [readback.recording_path, readback.agent_recording_path];
            if (targetPath === result.seekablePath) {
              result.readiness = "persisted";
            } else if (
              paths.includes(result.seekablePath) ||
              (targetPath !== null && targetPath !== undefined)
            ) {
              result.readiness = "ambiguous";
              ambiguous = true;
            } else {
              result.readiness = "confirmed-unpersisted";
            }
          }

          if (!ambiguous && successfulResults.every((result) => result.readiness === "persisted")) {
            readiness = normalizeReadbackReadiness(readback);
          }
        } else {
          for (const result of successfulResults) {
            result.readiness = "ambiguous";
          }
        }

        if (!readiness) {
          // Read-back may prove some siblings persisted while others did not.
          // Clean each safe classification before returning, rather than
          // letting an early ambiguity response orphan persisted raw objects.
          await removeConfirmedUnpersisted();
          await removePersistedOriginals();
          const ambiguous = successfulResults.some(
            (result) => result.readiness === "ambiguous",
          );
          const code = ambiguous
            ? "RECORDING_RECONCILIATION_AMBIGUOUS"
            : "RECORDING_STATE_UNAVAILABLE";
          return c.json(
            { success: false, error: { code, message: readinessFailureMessage(code) } },
            503,
          );
        }
      } else if (!rpcRow.applied) {
        for (const result of successfulResults) {
          result.readiness = "confirmed-unpersisted";
        }
        await removeConfirmedUnpersisted();
        const status = readinessFailureStatus(rpcRow.reason);
        const code = readinessFailureCode(status);
        return c.json(
          {
            success: false,
            error: { code, message: readinessFailureMessage(code) },
          },
          status,
        );
      } else {
        readiness = rpcRow;
        for (const result of successfulResults) {
          result.readiness = "persisted";
        }
      }

      await removePersistedOriginals();
    } else if (anyRemuxed) {
      const dbUpdate: Record<string, string> = {};
      const toDelete: string[] = [];

      for (const result of results) {
        if (!result.remuxed) continue;
        if (
          result.storageOwnership === "none" &&
          result.originalPath === result.seekablePath
        ) {
          continue;
        }
        dbUpdate[result.field] = result.seekablePath;
        if (result.storageOwnership === "created") {
          toDelete.push(result.originalPath);
        }
      }

      if (Object.keys(dbUpdate).length > 0) {
        const { error: updateError } = await adminClient
          .from("telefun_history")
          .update(dbUpdate)
          .eq("id", sessionId);

        if (updateError) {
          const uploadedPaths = results
            .filter((result) => result.storageOwnership === "created")
            .map((result) => result.seekablePath);
          if (uploadedPaths.length > 0) {
            await adminClient.storage
              .from("telefun-recordings")
              .remove(uploadedPaths);
          }
          return c.json(
            {
              success: false,
              error: {
                code: "DB_UPDATE_FAILED",
                message: "Path rekaman belum dapat disimpan.",
              },
            },
            500,
          );
        }

        if (toDelete.length > 0) {
          const { error: removeError } = await adminClient.storage
            .from("telefun-recordings")
            .remove(toDelete);
          if (removeError) {
            console.warn("[Telefun] Failed to remove original recordings");
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

    const fullReady = results.some(
      (result) =>
        result.remuxed &&
        sourcePaths.some(
          (source) =>
            source.field === "recording_path" && source.path === result.originalPath,
        ),
    );
    const agentReady = results.some(
      (result) =>
        result.remuxed &&
        sourcePaths.some(
          (source) =>
            source.field === "agent_recording_path" && source.path === result.originalPath,
        ),
    );
    const recordingStatus = readiness?.recording_status ??
      (fullReady && agentReady ? "ready" : "partial");
    const recordingReady = readiness?.recording_ready ?? (fullReady || agentReady);
    const scoringReady = readiness?.scoring_ready ?? Boolean(session.scoring_ready_at);
    const scoringReadyAt = readiness?.scoring_ready_at ?? session.scoring_ready_at ?? null;
    const scoringStatus = readiness?.scoring_status ??
      (session.scoring_status as TelefunScoringStatus | undefined) ?? "pending";

    return c.json({
      success: true,
      data: {
        remuxed: allRemuxed,
        recordings,
        recordingStatus,
        recordingReady,
        scoringReady,
        scoringReadyAt,
        scoringStatus,
      },
    });
  } catch (_error: unknown) {
    return c.json(
      {
        success: false,
        error: { code: "REMUX_ERROR", message: "Remux rekaman gagal." },
      },
      500,
    );
  }
});

export { telefunRemuxRecording };
