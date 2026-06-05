import { describe, expect, it } from "vitest";
import {
  evaluateHoldState,
  createInitialConsentContext,
} from "../routes/telefun/services/realisticMode/holdStateManager";
import type { HoldState } from "../routes/telefun/services/realisticMode/types";

const consentContext = createInitialConsentContext();

function activeHoldState(overrides?: Partial<HoldState>): HoldState {
  return {
    source: "ui",
    activeSince: 0,
    uiTimerDurationMs: 60_000,
    holdCount: 1,
    ...overrides,
  };
}

describe("holdStateManager expiry removal", () => {
  it("keeps hold active after its service limit until UI release", () => {
    const active = evaluateHoldState(activeHoldState(), {
      now: 61_000,
      uiButtonPressed: false,
      uiButtonReleased: false,
      consentContext,
      currentHoldActive: true,
    });

    expect(active.action).toBe("none");
    expect(active.state.source).toBe("ui");
    expect(active.suppressMicAudio).toBe(true);
  });

  it("still allows deactivation via UI release", () => {
    const active = evaluateHoldState(
      activeHoldState({ activeSince: 200_000 }),
      {
        now: 200_000,
        uiButtonPressed: false,
        uiButtonReleased: true,
        consentContext,
        currentHoldActive: true,
      },
    );

    expect(active.action).toBe("deactivate_hold");
    expect(active.state.source).toBe("none");
    expect(active.suppressMicAudio).toBe(false);
  });

  it("no longer has uiTimerExpired field in HoldInput", () => {
    const input: Parameters<typeof evaluateHoldState>[1] = {
      now: 0,
      uiButtonPressed: false,
      uiButtonReleased: false,
      consentContext,
      currentHoldActive: false,
    };
    expect((input as any).uiTimerExpired).toBeUndefined();
  });
});
