import {
  ApiError,
  telefunClient,
  unwrapResponse,
} from "../../../lib/api";

export interface RemuxRecordingResult {
  remuxed: boolean;
  recordings: Record<
    string,
    {
      originalPath: string;
      seekablePath?: string;
      remuxed: boolean;
    }
  >;
  recordingStatus?: "uploaded" | "partial" | "ready" | "failed";
  recordingReady?: boolean;
  scoringReady?: boolean;
  scoringReadyAt?: string | null;
  scoringStatus?: "pending" | "processing" | "completed" | "failed";
}

/**
 * Remux a Telefun recording for a given session.
 *
 * Calls POST /telefun/remux-recording/:sessionId on the API.
 * The server-side handler downloads the WebM from Supabase, runs FFmpeg
 * remux, and writes versioned seekable copies.
 *
 * On success, the DB recording paths are already updated to seekable versions.
 *
 * @param sessionId – the Telefun session whose recordings should be remuxed
 * @returns `{ success: true, data: RemuxRecordingResult }` on success, or
 *          `{ success: false, error: string }` if the request failed.
 */
export async function remuxRecording(
  sessionId: string,
): Promise<{
  success: boolean;
  data?: RemuxRecordingResult;
  error?: string;
  errorCode?: string;
}> {
  try {
    console.log(`[remux] Starting remux for session ${sessionId}`);

    const data = await unwrapResponse(
      await telefunClient["remux-recording"][":sessionId"].$post({
        param: { sessionId },
        json: {},
      }),
    ) as RemuxRecordingResult;

    console.log(
      `[remux] Session ${sessionId} — remuxed: ${data?.remuxed ?? "unknown"}`,
    );

    return { success: true, data };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Remux recording failed";

    console.warn(`[remux] Session ${sessionId} — failed:`, message);

    return {
      success: false,
      error: message,
      errorCode: err instanceof ApiError ? err.code : "NETWORK_ERROR",
    };
  }
}
