const VALID_TYPES = ["full_call", "agent_only"] as const;

const VALID_EXTENSIONS = [".webm", ".opus", ".ogg", ".mp3", ".wav", ".m4a"];

function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function buildTelefunRecordingPath(input: {
  userId: string;
  sessionId: string;
  type: "full_call" | "agent_only";
}): string {
  return `${input.userId}/${input.sessionId}/${input.type}.webm`;
}

export function isValidRecordingPath(
  path: string,
  userId: string,
  sessionId: string,
  type: string,
): boolean {
  if (!path || typeof path !== "string") return false;
  if (!isUUID(userId)) return false;
  if (!isUUID(sessionId)) return false;
  if (!VALID_TYPES.includes(type as any)) return false;

  const segments = path.split("/");
  if (segments.length < 2) return false;
  if (segments.some((seg) => seg === ".." || seg === ".")) return false;

  const pathUserId = segments[0];
  const pathSessionId = segments[1];

  if (pathUserId !== userId) return false;
  if (pathSessionId !== sessionId) return false;

  const fileName = segments[segments.length - 1];
  const expectedPrefix = `${type}.`;
  if (!fileName.startsWith(expectedPrefix)) return false;

  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (!VALID_EXTENSIONS.includes(ext)) return false;

  return true;
}

export function getOwnedRecordingPathOrNull(
  path: string | null | undefined,
  userId: string,
  sessionId: string,
  type: string,
): string | null {
  if (!path) return null;
  return isValidRecordingPath(path, userId, sessionId, type) ? path : null;
}
