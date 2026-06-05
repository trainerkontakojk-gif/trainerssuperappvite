import { describe, expect, it, vi } from "vitest";
import { finalizeTelefunSession } from "../routes/telefun/sessionFinalizer";
import type {
  SessionMetrics,
  TelefunScoreResult,
  VoiceQualityAssessment,
} from "@trainers/types";

function baseMetrics(): SessionMetrics {
  return {
    speechSegments: [],
    totalSpeakingMs: 0,
    totalSilenceMs: 0,
    deadAirCount: 0,
    interruptionCount: 0,
    volumeSamples: [],
    volumeConsistency: 0,
    inputTranscriptionChunks: [],
    sessionDurationMs: 12000,
  };
}

describe("Telefun Session Finalizer", () => {
  const mockAssessment: VoiceQualityAssessment = {
    overallScore: 8,
    speakingRate: {
      score: 7,
      wordsPerMinute: 130,
      verdict: "Baik",
      feedback: "Tempo oke",
    },
    intonation: { score: 8, verdict: "Baik", feedback: "Intonasi baik" },
    articulation: { score: 9, verdict: "Baik", feedback: "Jelas" },
    fillerWords: {
      score: 8,
      count: 2,
      examples: ["uh"],
      verdict: "Baik",
      feedback: "Minim",
    },
    emotionalTone: {
      score: 7,
      dominant: "tenang",
      verdict: "Baik",
      feedback: "Empati cukup",
    },
    transcript: "Tes",
    highlights: [],
    strengths: [],
    communicationProfile: null,
  };

  it("uploads and finalizes recording before scoring", async () => {
    const calls: string[] = [];

    const result = await finalizeTelefunSession({
      sessionId: "session-1",
      fullBlob: new Blob(["full"]),
      agentBlob: new Blob(["agent"]),
      duration: 12,
      metrics: baseMetrics(),
      localUrl: "blob:local",
      sessionConfig: null,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async ({ type }) => {
          calls.push(`upload:${type}`);
          return `user-1/session-1/${type}.webm`;
        }),
        patchSession: vi.fn(async () => {
          calls.push("patch");
        }),
        finalizeRecording: vi.fn(async () => {
          calls.push("finalize");
        }),
        scoreSession: vi.fn(async () => {
          calls.push("score");
          return {
            score: 8,
            feedback: "Bagus",
            assessment: { ...mockAssessment, overallScore: 8 },
          };
        }),
      },
    });

    expect(calls).toEqual([
      "upload:full_call",
      "upload:agent_only",
      "patch",
      "finalize",
      "score",
      "patch",
    ]);
    expect(result.record.score).toBe(8);
    expect(result.record.feedback).toBe("Bagus");
  });

  it("includes voiceAssessment in record when scoring provides assessment", async () => {
    const calls: string[] = [];
    const result = await finalizeTelefunSession({
      sessionId: "session-2",
      fullBlob: null,
      agentBlob: new Blob(["agent"]),
      duration: 15,
      metrics: { ...baseMetrics(), sessionDurationMs: 15000 },
      localUrl: "blob:local",
      sessionConfig: null,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async ({ type }) => {
          calls.push(`upload:${type}`);
          return `user-1/session-2/${type}.webm`;
        }),
        patchSession: vi.fn(async () => {
          calls.push("patch");
        }),
        finalizeRecording: vi.fn(async () => {}),
        scoreSession: vi.fn(async () => {
          return {
            score: 9,
            feedback: "Bagus",
            assessment: { ...mockAssessment, overallScore: 9 },
          };
        }),
      },
    });

    expect(result.record.voiceAssessment?.overallScore).toBe(9);
    expect(result.record.score).toBe(9);
  });

  it("patches score 0 when assessment is valid but score is zero", async () => {
    const calls: string[] = [];
    const result = await finalizeTelefunSession({
      sessionId: "session-zero",
      fullBlob: null,
      agentBlob: new Blob(["agent"]),
      duration: 15,
      metrics: baseMetrics(),
      localUrl: "blob:local",
      sessionConfig: null,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async () => "path"),
        patchSession: vi.fn(async (_id, body) => {
          if (body.score !== undefined) {
            calls.push(`patch:score:${body.score}`);
          }
        }),
        finalizeRecording: vi.fn(async () => {}),
        scoreSession: vi.fn(async () => {
          return {
            score: 0,
            feedback: "Kurang",
            assessment: { ...mockAssessment, overallScore: 0 },
          };
        }),
      },
    });

    expect(calls).toContain("patch:score:0");
    expect(result.record.score).toBe(0);
  });

  it("marks scoringFailed when the score boundary rejects a response", async () => {
    const result = await finalizeTelefunSession({
      sessionId: "session-invalid-score",
      fullBlob: null,
      agentBlob: new Blob(["agent"]),
      duration: 15,
      metrics: baseMetrics(),
      localUrl: null,
      sessionConfig: null,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async () => "path"),
        patchSession: vi.fn(async () => {}),
        finalizeRecording: vi.fn(async () => {}),
        scoreSession: vi.fn(async (): Promise<TelefunScoreResult> => {
          throw new Error("Format hasil penilaian Telefun tidak valid.");
        }),
      },
    });

    expect(result.scoringFailed).toBe(true);
    expect(result.record.voiceAssessment).toBeUndefined();
    expect(result.record.score).toBe(0);
  });

  it("marks upload and scoring failures when recordings exist but user id is unavailable", async () => {
    const result = await finalizeTelefunSession({
      sessionId: "session-no-user",
      fullBlob: new Blob(["full"]),
      agentBlob: new Blob(["agent"]),
      duration: 20,
      metrics: { ...baseMetrics(), sessionDurationMs: 20000 },
      localUrl: "blob:local",
      sessionConfig: null,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => undefined),
        uploadRecording: vi.fn(async () => {
          throw new Error("upload should not run without user id");
        }),
        patchSession: vi.fn(async () => {}),
        finalizeRecording: vi.fn(async () => {}),
        scoreSession: vi.fn(async (): Promise<TelefunScoreResult> => {
          throw new Error("score should not run");
        }),
      },
    });

    expect(result.uploadFailed).toBe(true);
    expect(result.scoringFailed).toBe(true);
    expect(result.saveFailed).toBe(false);
    expect(result.record.recordingPath).toBeUndefined();
    expect(result.record.agentRecordingPath).toBeUndefined();
  });

  it("keeps saveFailed in the public return contract when base patch fails", async () => {
    const result = await finalizeTelefunSession({
      sessionId: "session-save-fails",
      fullBlob: null,
      agentBlob: null,
      duration: 10,
      metrics: { ...baseMetrics(), sessionDurationMs: 10000 },
      localUrl: null,
      sessionConfig: null,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async () => undefined),
        patchSession: vi.fn(async () => {
          throw new Error("patch failed");
        }),
        finalizeRecording: vi.fn(async () => {}),
        scoreSession: vi.fn(async (): Promise<TelefunScoreResult> => {
          throw new Error("score should not run");
        }),
      },
    });

    expect(result.saveFailed).toBe(true);
    expect(result.uploadFailed).toBe(false);
    expect(result.scoringFailed).toBe(true);
  });

  it("patches session metrics before scoring (ordering)", async () => {
    const calls: string[] = [];

    await finalizeTelefunSession({
      sessionId: "session-order",
      fullBlob: null,
      agentBlob: new Blob(["agent"]),
      duration: 12,
      metrics: { ...baseMetrics(), sessionDurationMs: 12000 },
      localUrl: null,
      sessionConfig: null,
      scenarioTitle: "Test",
      consumerName: "Test",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async ({ type }) => {
          calls.push(`upload:${type}`);
          return `path`;
        }),
        patchSession: vi.fn(async (_id, body) => {
          if (body.session_metrics) calls.push("patch:metrics");
          else calls.push("patch:score");
        }),
        finalizeRecording: vi.fn(async () => {
          calls.push("finalize");
        }),
        scoreSession: vi.fn(async () => {
          calls.push("score");
          return {
            score: 8,
            feedback: "Baik",
            assessment: mockAssessment,
          };
        }),
      },
    });

    const patchMetricsIdx = calls.indexOf("patch:metrics");
    const scoreIdx = calls.indexOf("score");
    expect(patchMetricsIdx).toBeGreaterThan(-1);
    expect(scoreIdx).toBeGreaterThan(-1);
    expect(patchMetricsIdx).toBeLessThan(scoreIdx);
  });

  it("retains hold metrics in patch even when scoring fails (no agent recording)", async () => {
    const capturedBodies: Array<{
      session_metrics?: SessionMetrics;
      score?: number;
    }> = [];

    await finalizeTelefunSession({
      sessionId: "session-hold-retain",
      fullBlob: null,
      agentBlob: null,
      duration: 10,
      metrics: {
        ...baseMetrics(),
        sessionDurationMs: 10000,
        hold: {
          count: 1,
          totalDurationMs: 61_000,
          longestDurationMs: 61_000,
          exceededCount: 1,
          intervals: [
            {
              sequence: 1,
              startedAtMs: 0,
              endedAtMs: 61_000,
              durationMs: 61_000,
              limitMs: 60_000,
              exceededByMs: 1_000,
            },
          ],
        },
      },
      localUrl: null,
      sessionConfig: null,
      scenarioTitle: "Test",
      consumerName: "Test",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async () => undefined),
        patchSession: vi.fn(async (_id, body) => {
          capturedBodies.push(body);
        }),
        finalizeRecording: vi.fn(async () => {}),
        scoreSession: vi.fn(async (): Promise<TelefunScoreResult> => {
          throw new Error("score should not run");
        }),
      },
    });

    expect(capturedBodies.length).toBeGreaterThanOrEqual(1);
    const metricsPatch = capturedBodies.find((body) => body.session_metrics);
    expect(metricsPatch).toBeDefined();
    expect(metricsPatch?.session_metrics?.hold).toBeDefined();
    expect(metricsPatch?.session_metrics?.hold?.count).toBe(1);
  });
});
