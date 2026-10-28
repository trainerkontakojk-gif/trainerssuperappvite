export interface TelefunCaptureReadinessState {
  status?: string | null;
  recording_status?: string | null;
  recording_error?: string | null;
  recording_path?: string | null;
  agent_recording_path?: string | null;
}

function isOwnedCaptureTrackPath(
  path: unknown,
  userId: string,
  sessionId: string,
  track: "full_call" | "agent_only",
): boolean {
  return (
    path === `${userId}/${sessionId}/${track}.webm` ||
    path === `${userId}/${sessionId}/${track}.seekable.webm`
  );
}

/** Both required browser recordings must be durably owned and non-failed. */
export function isTelefunCaptureScoringReady(
  state: TelefunCaptureReadinessState | null | undefined,
  userId: string,
  sessionId: string,
): boolean {
  return (
    state?.status === "completed" &&
    (state.recording_status === "uploaded" ||
      state.recording_status === "partial" ||
      state.recording_status === "ready") &&
    state.recording_error == null &&
    isOwnedCaptureTrackPath(
      state.recording_path,
      userId,
      sessionId,
      "full_call",
    ) &&
    isOwnedCaptureTrackPath(
      state.agent_recording_path,
      userId,
      sessionId,
      "agent_only",
    )
  );
}
