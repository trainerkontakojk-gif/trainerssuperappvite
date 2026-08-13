import type { SessionMetrics } from "@trainers/types";
import {
  createHoldTrackerState,
  endHold,
  finalizeActiveHold,
  startHold,
  summarizeHoldMetrics,
  type HoldTrackerState,
} from "../holdMetrics";
import { calculateRecordingVolumeConsistency } from "./recording";

/** Tracks browser-observed speech and hold timing without owning transport. */
export class OpenAIWebRtcSessionMetricsTracker {
  private sessionStartTime = 0;
  private speechSegments: SessionMetrics["speechSegments"] = [];
  private currentSpeechSegmentStartMs: number | null = null;
  private totalSpeakingMs = 0;
  private holdTracker: HoldTrackerState = createHoldTrackerState();

  public start(): void {
    this.sessionStartTime = Date.now();
  }

  public setHeld(held: boolean): boolean {
    const relativeNow = this.getRelativeSessionTimeMs();
    this.holdTracker = held
      ? startHold(this.holdTracker, relativeNow)
      : endHold(this.holdTracker, relativeNow);
    return this.holdTracker.active !== null;
  }

  public recordSpeechStarted(): void {
    if (this.currentSpeechSegmentStartMs === null) {
      this.currentSpeechSegmentStartMs = this.getRelativeSessionTimeMs();
    }
  }

  public recordSpeechStopped(): void {
    if (this.currentSpeechSegmentStartMs === null) return;
    const endMs = this.getRelativeSessionTimeMs();
    const durationMs = Math.max(0, endMs - this.currentSpeechSegmentStartMs);
    if (durationMs > 200) {
      this.speechSegments.push({
        startMs: this.currentSpeechSegmentStartMs,
        endMs,
        durationMs,
      });
      this.totalSpeakingMs += durationMs;
    }
    this.currentSpeechSegmentStartMs = null;
  }

  public build(params: {
    volumeSamples: number[];
    interruptionCount: number;
  }): SessionMetrics {
    const sessionDurationMs = this.getRelativeSessionTimeMs();
    this.finalizeSpeechSegment(sessionDurationMs);
    this.holdTracker = finalizeActiveHold(this.holdTracker, sessionDurationMs);
    return {
      speechSegments: this.speechSegments,
      totalSpeakingMs: this.totalSpeakingMs,
      totalSilenceMs: Math.max(0, sessionDurationMs - this.totalSpeakingMs),
      deadAirCount: 0,
      interruptionCount: params.interruptionCount,
      volumeSamples: params.volumeSamples,
      volumeConsistency: calculateRecordingVolumeConsistency(
        params.volumeSamples,
      ),
      inputTranscriptionChunks: [],
      sessionDurationMs,
      hold: summarizeHoldMetrics(this.holdTracker),
    };
  }

  private finalizeSpeechSegment(sessionEndMs: number): void {
    if (this.currentSpeechSegmentStartMs === null) return;
    const durationMs = Math.max(
      0,
      sessionEndMs - this.currentSpeechSegmentStartMs,
    );
    if (durationMs > 200) {
      this.speechSegments.push({
        startMs: this.currentSpeechSegmentStartMs,
        endMs: sessionEndMs,
        durationMs,
      });
      this.totalSpeakingMs += durationMs;
    }
    this.currentSpeechSegmentStartMs = null;
  }

  private getRelativeSessionTimeMs(): number {
    return this.sessionStartTime
      ? Math.max(0, Date.now() - this.sessionStartTime)
      : 0;
  }
}
