import { describe, expect, it, vi } from "vitest";
import { createOrphanCleanupWorker } from "./orphan-cleanup.js";

const candidate = {
  leaseId: "lease-1",
  attemptId: "attempt-1",
  sessionId: "session-1",
  userId: "user-1",
  provider: "openai-webrtc" as const,
  providerCallReference: null,
  sidebandConnected: false,
};

describe("historical WebRTC orphan cleanup", () => {
  it("keeps a bound attempt with a missing encrypted reference retryable", async () => {
    const complete = vi.fn(async () => undefined);
    const closeProvider = vi.fn(async () => true);
    const getProviderBinding = vi.fn(async () => "bound" as const);
    const worker = createOrphanCleanupWorker({
      store: {
        claim: vi.fn(async () => [candidate]),
        getProviderBinding,
        complete,
      },
      closeProvider,
    });

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
    });
    expect(getProviderBinding).toHaveBeenCalledWith(candidate);
    expect(closeProvider).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith({
      leaseId: candidate.leaseId,
      attemptId: candidate.attemptId,
      outcome: "orphaned",
      providerClosed: false,
      sidebandClosed: true,
      errorCode: "provider_reference_unavailable",
    });
  });

  it("terminalizes a missing-reference orphan only when the server proves no provider was bound", async () => {
    const complete = vi.fn(async () => undefined);
    const closeProvider = vi.fn(async () => true);
    const worker = createOrphanCleanupWorker({
      store: {
        claim: vi.fn(async () => [candidate]),
        getProviderBinding: vi.fn(async () => "unbound" as const),
        complete,
      },
      closeProvider,
    });

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
    });
    expect(closeProvider).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith({
      leaseId: candidate.leaseId,
      attemptId: candidate.attemptId,
      outcome: "orphaned",
      providerClosed: true,
      sidebandClosed: true,
    });
  });
});
