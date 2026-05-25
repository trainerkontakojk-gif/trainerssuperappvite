import { describe, expect, it } from "vitest";
import {
  buildTelefunRecordingPath,
  isValidRecordingPath,
  getOwnedRecordingPathOrNull,
} from "../routes/telefun/recordingPath";

const USER_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const SESSION_ID = "f9e8d7c6-b5a4-3210-fedc-ba0987654321";

describe("buildTelefunRecordingPath", () => {
  it("uses user id as first folder segment", () => {
    expect(
      buildTelefunRecordingPath({
        userId: "user-1",
        sessionId: "session-1",
        type: "full_call",
      }),
    ).toBe("user-1/session-1/full_call.webm");
  });

  it("generates agent_only path", () => {
    expect(
      buildTelefunRecordingPath({
        userId: USER_ID,
        sessionId: SESSION_ID,
        type: "agent_only",
      }),
    ).toBe(`${USER_ID}/${SESSION_ID}/agent_only.webm`);
  });
});

describe("isValidRecordingPath", () => {
  it("accepts valid full_call path", () => {
    expect(
      isValidRecordingPath(
        `${USER_ID}/${SESSION_ID}/full_call.webm`,
        USER_ID,
        SESSION_ID,
        "full_call",
      ),
    ).toBe(true);
  });

  it("accepts valid agent_only path", () => {
    expect(
      isValidRecordingPath(
        `${USER_ID}/${SESSION_ID}/agent_only.webm`,
        USER_ID,
        SESSION_ID,
        "agent_only",
      ),
    ).toBe(true);
  });

  it("rejects path with wrong user id", () => {
    expect(
      isValidRecordingPath(
        `wrong-user/${SESSION_ID}/full_call.webm`,
        USER_ID,
        SESSION_ID,
        "full_call",
      ),
    ).toBe(false);
  });

  it("rejects path with wrong session id", () => {
    expect(
      isValidRecordingPath(
        `${USER_ID}/wrong-session/full_call.webm`,
        USER_ID,
        SESSION_ID,
        "full_call",
      ),
    ).toBe(false);
  });

  it("rejects path with wrong type in filename", () => {
    expect(
      isValidRecordingPath(
        `${USER_ID}/${SESSION_ID}/agent_only.webm`,
        USER_ID,
        SESSION_ID,
        "full_call",
      ),
    ).toBe(false);
  });

  it("rejects path with directory traversal", () => {
    expect(
      isValidRecordingPath(
        `${USER_ID}/${SESSION_ID}/../full_call.webm`,
        USER_ID,
        SESSION_ID,
        "full_call",
      ),
    ).toBe(false);
  });

  it("rejects empty path", () => {
    expect(isValidRecordingPath("", USER_ID, SESSION_ID, "full_call")).toBe(
      false,
    );
  });

  it("rejects null path", () => {
    expect(
      isValidRecordingPath(null as any, USER_ID, SESSION_ID, "full_call"),
    ).toBe(false);
  });

  it("rejects path with invalid extension", () => {
    expect(
      isValidRecordingPath(
        `${USER_ID}/${SESSION_ID}/full_call.exe`,
        USER_ID,
        SESSION_ID,
        "full_call",
      ),
    ).toBe(false);
  });

  it("rejects invalid type", () => {
    expect(
      isValidRecordingPath(
        `${USER_ID}/${SESSION_ID}/malicious.webm`,
        USER_ID,
        SESSION_ID,
        "malicious" as any,
      ),
    ).toBe(false);
  });

  it("accepts opus extension", () => {
    expect(
      isValidRecordingPath(
        `${USER_ID}/${SESSION_ID}/full_call.opus`,
        USER_ID,
        SESSION_ID,
        "full_call",
      ),
    ).toBe(true);
  });
});

describe("getOwnedRecordingPathOrNull", () => {
  it("returns path when valid", () => {
    const path = `${USER_ID}/${SESSION_ID}/full_call.webm`;
    expect(
      getOwnedRecordingPathOrNull(path, USER_ID, SESSION_ID, "full_call"),
    ).toBe(path);
  });

  it("returns null when path is null", () => {
    expect(
      getOwnedRecordingPathOrNull(null, USER_ID, SESSION_ID, "full_call"),
    ).toBe(null);
  });

  it("returns null when ownership mismatch", () => {
    expect(
      getOwnedRecordingPathOrNull(
        `other-user/${SESSION_ID}/full_call.webm`,
        USER_ID,
        SESSION_ID,
        "full_call",
      ),
    ).toBe(null);
  });
});
