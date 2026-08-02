import type { SidebandClient } from "./sideband-client.js";
import { WebRtcDurabilityError, type AttemptOutcome } from "../db.js";
import { withTimeout } from "./call-manager-utils.js";

export interface SidebandBarrierBinding {
  callId: string;
  state: "claimed" | "brokered" | "sideband_connected" | "ending" | "ended";
  terminalStatus: AttemptOutcome | null;
  startController: AbortController;
  sideband: SidebandClient | null;
  sidebandAdmissionSealed: boolean;
  sidebandClosed: boolean;
  sidebandConnectPromise: Promise<void> | null;
}

export async function runProviderAndSidebandBarrier(
  binding: SidebandBarrierBinding,
  input: {
    closeProvider: () => Promise<boolean>;
    sidebandDrainTimeoutMs: number;
  },
): Promise<{
  providerClosed: boolean;
  sidebandFailure: WebRtcDurabilityError | null;
}> {
  binding.state = "ending";
  if (!binding.callId) binding.startController.abort();
  const providerClosed = await input.closeProvider();
  if (!providerClosed) binding.terminalStatus = "failed";
  const sidebandFailure = await drainAndCloseSideband(
    binding,
    input.sidebandDrainTimeoutMs,
  );
  return { providerClosed, sidebandFailure };
}

async function drainAndCloseSideband(
  binding: SidebandBarrierBinding,
  sidebandDrainTimeoutMs: number,
): Promise<WebRtcDurabilityError | null> {
  const sideband = binding.sideband;
  if (!sideband) return null;

  let failure: WebRtcDurabilityError | null = null;
  if (!binding.sidebandAdmissionSealed) {
    try {
      // Provider hangup has already completed. This synchronous call is the
      // only admission cut-off for frames observed during that request.
      sideband.sealAdmission();
      binding.sidebandAdmissionSealed = true;
    } catch {
      failure = new WebRtcDurabilityError("sideband_seal");
    }
  }

  try {
    await withTimeout(
      sideband.drain(sidebandDrainTimeoutMs),
      sidebandDrainTimeoutMs,
      () => new WebRtcDurabilityError("sideband_drain"),
    );
  } catch {
    failure ??= new WebRtcDurabilityError("sideband_drain");
  } finally {
    if (!binding.sidebandClosed) {
      binding.sidebandClosed = true;
      try {
        sideband.close();
      } catch {
        failure ??= new WebRtcDurabilityError("sideband_close");
      }
    }
    if (binding.sidebandConnectPromise) {
      try {
        await withTimeout(
          binding.sidebandConnectPromise,
          sidebandDrainTimeoutMs,
          () => new WebRtcDurabilityError("sideband_connect"),
        );
      } catch {
        // Closing a pending sideband intentionally rejects its connect promise.
      }
    }
  }
  return failure;
}
