import type { TelefunAuthMessage } from "./server-protocol.js";

interface AuthenticatedUser {
  id: string;
  email?: string | null;
}

interface TelefunAuthDependencies {
  verifyToken: (token: string) => Promise<{
    success: boolean;
    user?: AuthenticatedUser | null;
  }>;
  getOwnedSessionId: (
    sessionId: string,
    userId: string,
  ) => Promise<string | null>;
  createSession: (userId: string) => Promise<string>;
}

export type TelefunAuthResult =
  | {
      ok: true;
      userId: string;
      userEmail?: string;
      sessionId: string;
    }
  | {
      ok: false;
      closeCode: 4001 | 1011;
      reason:
        | "Unauthorized"
        | "Invalid Session"
        | "Authentication In Progress"
        | "Duplicate Authentication"
        | "Session Initialization Failed";
    };

export class TelefunAuthGate {
  private state: "idle" | "in_flight" | "authenticated" = "idle";

  constructor(private readonly dependencies: TelefunAuthDependencies) {}

  async authenticate(message: TelefunAuthMessage): Promise<TelefunAuthResult> {
    if (this.state === "authenticated") {
      return {
        ok: false,
        closeCode: 4001,
        reason: "Duplicate Authentication",
      };
    }
    if (this.state === "in_flight") {
      return {
        ok: false,
        closeCode: 4001,
        reason: "Authentication In Progress",
      };
    }

    this.state = "in_flight";
    try {
      const authResult = await this.dependencies.verifyToken(message.token);
      if (!authResult.success || !authResult.user) {
        this.state = "idle";
        return { ok: false, closeCode: 4001, reason: "Unauthorized" };
      }

      const userId = authResult.user.id;
      const sessionId = message.sessionId
        ? await this.dependencies.getOwnedSessionId(message.sessionId, userId)
        : await this.dependencies.createSession(userId);

      if (!sessionId) {
        this.state = "idle";
        return { ok: false, closeCode: 4001, reason: "Invalid Session" };
      }

      this.state = "authenticated";
      return {
        ok: true,
        userId,
        ...(authResult.user.email ? { userEmail: authResult.user.email } : {}),
        sessionId,
      };
    } catch {
      this.state = "idle";
      return {
        ok: false,
        closeCode: 1011,
        reason: "Session Initialization Failed",
      };
    }
  }
}
