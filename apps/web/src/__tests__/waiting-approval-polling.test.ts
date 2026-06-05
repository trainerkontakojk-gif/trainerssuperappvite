import { describe, expect, it } from "vitest";

import {
  WAITING_APPROVAL_POLL_INTERVAL_MS,
  shouldPollWaitingApproval,
} from "../routes/waitingApprovalPolling";

describe("waiting approval polling policy", () => {
  it("uses a five minute interval to avoid idle Supabase polling every minute", () => {
    expect(WAITING_APPROVAL_POLL_INTERVAL_MS).toBe(5 * 60 * 1000);
  });

  it("skips polling while the tab is hidden", () => {
    expect(shouldPollWaitingApproval({ visibilityState: "hidden" })).toBe(false);
    expect(shouldPollWaitingApproval({ visibilityState: "visible" })).toBe(true);
  });
});
