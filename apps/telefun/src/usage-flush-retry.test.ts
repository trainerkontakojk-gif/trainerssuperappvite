import { describe, expect, it, vi } from "vitest";
import { retryUsageAfterInFlight } from "./usage-flush-retry.js";

describe("retryUsageAfterInFlight", () => {
  it("starts a fresh retry after a joined slow in-flight attempt fails", async () => {
    let resolveFirst!: () => void;
    const firstAttempt = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    let flushed = false;
    const flush = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(firstAttempt)
      .mockImplementationOnce(async () => {
        flushed = true;
      });

    const retry = retryUsageAfterInFlight(flush, () => flushed);
    expect(flush).toHaveBeenCalledOnce();
    resolveFirst();

    await expect(retry).resolves.toBe(true);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("does not create another attempt after the joined flush succeeds", async () => {
    let flushed = false;
    const flush = vi.fn(async () => {
      flushed = true;
    });

    await expect(
      retryUsageAfterInFlight(flush, () => flushed),
    ).resolves.toBe(true);
    expect(flush).toHaveBeenCalledOnce();
  });
});
