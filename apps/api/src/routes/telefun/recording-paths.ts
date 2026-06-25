export function isTelefunRecordingPathOwnedBySession(params: {
  path: string;
  userId: string;
  sessionId: string;
  type: "full_call" | "agent_only";
}): boolean {
  const parts = params.path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === params.userId &&
    parts[1] === params.sessionId &&
    parts[2] === `${params.type}.webm`
  );
}

