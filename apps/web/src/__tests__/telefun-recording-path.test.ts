import { describe, expect, it } from "vitest";
import { buildTelefunRecordingPath } from "../routes/telefun/recordingPath";

describe("buildTelefunRecordingPath", () => {
  it("uses user id as first folder segment", () => {
    expect(buildTelefunRecordingPath({
      userId: "user-1",
      sessionId: "session-1",
      type: "full_call",
    })).toBe("user-1/session-1/full_call.webm");
  });
});
