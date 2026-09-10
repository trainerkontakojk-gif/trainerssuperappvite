import { afterEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: { rpc: mockRpc },
}));

import {
  cleanupPdktMailboxSubjectIntents,
  startPdktMailboxSubjectIntentCleanup,
} from "../services/pdkt/mailbox-subject-intent-cleanup";

describe("PDKT mailbox subject intent cleanup", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("calls the service-role cleanup RPC and returns its deleted count", async () => {
    mockRpc.mockResolvedValueOnce({ data: 4, error: null });

    await expect(cleanupPdktMailboxSubjectIntents()).resolves.toBe(4);
    expect(mockRpc).toHaveBeenCalledWith(
      "cleanup_pdkt_mailbox_subject_intents",
    );
  });

  it("runs immediately and on an interval, then stops cleanly", async () => {
    vi.useFakeTimers();
    const cleanup = vi.fn().mockResolvedValue(0);
    const handle = startPdktMailboxSubjectIntentCleanup({
      intervalMs: 100,
      cleanup,
    });

    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(2);

    handle.stop();
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
