export function buildTelefunRecordingPath(input: {
  userId: string;
  sessionId: string;
  type: "full_call" | "agent_only";
}): string {
  return `${input.userId}/${input.sessionId}/${input.type}.webm`;
}
