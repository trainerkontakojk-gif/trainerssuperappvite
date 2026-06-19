import { telefunClient, unwrapResponse } from "../../../lib/api";

/**
 * Remux a Telefun recording for a given session.
 *
 * Calls POST /telefun/remux-recording/:sessionId on the API.
 * The server-side handler downloads the WebM from Supabase, runs FFmpeg
 * remux, and re-uploads the seekable version.
 *
 * This call is best-effort: failure must NOT break the session finalisation
 * flow, so callers should wrap calls in try/catch and treat the result as
 * advisory.
 *
 * @param sessionId – the Telefun session whose recordings should be remuxed
 * @returns `{ success: true, remuxed: boolean }` on API-level success, or
 *          `{ success: false, error: string }` if the request failed.
 */
export async function remuxRecording(
  sessionId: string,
): Promise<{ success: boolean; remuxed?: boolean; error?: string }> {
  try {
    console.log(`[remux] Starting remux for session ${sessionId}`);

    const response = await unwrapResponse(
      await telefunClient["remux-recording"][":sessionId"].$post({
        param: { sessionId },
        json: {},
      }),
    );

    const data = response as { remuxed?: boolean };

    console.log(
      `[remux] Session ${sessionId} — remuxed: ${data?.remuxed ?? "unknown"}`,
    );

    return { success: true, remuxed: data?.remuxed };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Remux recording failed";

    console.warn(`[remux] Session ${sessionId} — failed:`, message);

    return { success: false, error: message };
  }
}
