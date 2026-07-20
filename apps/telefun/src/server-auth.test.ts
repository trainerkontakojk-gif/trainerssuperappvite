import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { TelefunAuthGate } from "./server-auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(join(__dirname, "server.ts"), "utf8");

const authMessage = {
  type: "authenticate" as const,
  token: "token-1",
  sessionId: "session-1",
};

describe("Telefun first-message auth gate", () => {
  it("authenticates once, checks session ownership, and returns the owned session", async () => {
    const verifyToken = vi.fn(async () => ({
      success: true,
      user: { id: "user-1", email: "user@example.test" },
    }));
    const getOwnedSessionId = vi.fn(async () => "session-1");
    const createSession = vi.fn(async () => "new-session");
    const gate = new TelefunAuthGate({
      verifyToken,
      getOwnedSessionId,
      createSession,
    });

    await expect(gate.authenticate(authMessage)).resolves.toEqual({
      ok: true,
      userId: "user-1",
      userEmail: "user@example.test",
      sessionId: "session-1",
    });
    expect(verifyToken).toHaveBeenCalledTimes(1);
    expect(getOwnedSessionId).toHaveBeenCalledWith("session-1", "user-1");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects invalid credentials before session or Gemini initialization can continue", async () => {
    const getOwnedSessionId = vi.fn();
    const createSession = vi.fn();
    const gate = new TelefunAuthGate({
      verifyToken: vi.fn(async () => ({ success: false })),
      getOwnedSessionId,
      createSession,
    });

    await expect(gate.authenticate(authMessage)).resolves.toEqual({
      ok: false,
      closeCode: 4001,
      reason: "Unauthorized",
    });
    expect(getOwnedSessionId).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects a foreign session instead of creating or attaching another session", async () => {
    const createSession = vi.fn();
    const gate = new TelefunAuthGate({
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getOwnedSessionId: vi.fn(async () => null),
      createSession,
    });

    await expect(gate.authenticate(authMessage)).resolves.toEqual({
      ok: false,
      closeCode: 4001,
      reason: "Invalid Session",
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects parallel and duplicate authentication while producing only one success", async () => {
    let resolveVerification!: (value: {
      success: true;
      user: { id: string };
    }) => void;
    const verification = new Promise<{
      success: true;
      user: { id: string };
    }>((resolve) => {
      resolveVerification = resolve;
    });
    const verifyToken = vi.fn(() => verification);
    const gate = new TelefunAuthGate({
      verifyToken,
      getOwnedSessionId: vi.fn(async () => "session-1"),
      createSession: vi.fn(async () => "new-session"),
    });

    const firstAttempt = gate.authenticate(authMessage);
    await expect(gate.authenticate(authMessage)).resolves.toEqual({
      ok: false,
      closeCode: 4001,
      reason: "Authentication In Progress",
    });

    resolveVerification({ success: true, user: { id: "user-1" } });
    await expect(firstAttempt).resolves.toMatchObject({ ok: true });
    await expect(gate.authenticate(authMessage)).resolves.toEqual({
      ok: false,
      closeCode: 4001,
      reason: "Duplicate Authentication",
    });
    expect(verifyToken).toHaveBeenCalledTimes(1);
  });

  it("maps session initialization errors to an internal close without authenticating", async () => {
    const gate = new TelefunAuthGate({
      verifyToken: vi.fn(async () => ({
        success: true,
        user: { id: "user-1" },
      })),
      getOwnedSessionId: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
      createSession: vi.fn(async () => "new-session"),
    });

    await expect(gate.authenticate(authMessage)).resolves.toEqual({
      ok: false,
      closeCode: 1011,
      reason: "Session Initialization Failed",
    });
  });

  it("keeps the server glue gated and times out unauthenticated connections", () => {
    const authHandlerStart = serverSource.indexOf(
      "const authenticateClient = async",
    );
    const messageHandlerStart = serverSource.indexOf(
      "// Message handler: authenticate, configure once, then delegate provider data.",
    );
    const authHandler = serverSource.slice(
      authHandlerStart,
      messageHandlerStart,
    );

    expect(authHandler).toContain("await authGate.authenticate(message)");
    expect(authHandler.indexOf("if (!authResult.ok)")).toBeLessThan(
      authHandler.indexOf("configurationGate.start()"),
    );
    expect(authHandler).not.toContain("connectGemini()");
    expect(serverSource).toContain("if (!authed)");
    expect(serverSource).toContain('ws.close(4001, "Authentication Required")');
    expect(serverSource).toContain('ws.close(4001, "Authentication Timeout")');
    expect(serverSource).toContain("}, 10_000)");
  });

  it("rejects invalid pre-config frames and terminalizes on session end", () => {
    expect(serverSource).toContain(
      'configurationGate.rejectClientMessage("invalid_envelope")',
    );
    expect(serverSource).toContain(
      'configurationGate.rejectClientMessage("unexpected_control_message")',
    );
    const sessionEndBranch = serverSource.slice(
      serverSource.indexOf(
        "if (controlMsg && isSessionEndRequest(controlMsg))",
      ),
      serverSource.indexOf("if (configurationGate.handleMessage(parsed))"),
    );
    expect(
      sessionEndBranch.indexOf("configurationGate.dispose()"),
    ).toBeLessThan(sessionEndBranch.indexOf("drainCoordinator.startDrain()"));
  });

  it("never logs a Gemini key suffix", () => {
    expect(serverSource).not.toContain("env.GEMINI_API_KEY.slice");
    expect(serverSource).toContain(
      'env.GEMINI_API_KEY ? "configured" : "missing"',
    );
  });
});
