import { describe, expect, it, vi } from "vitest";
import {
  finalizeTelefunSession,
  saveTelefunSession,
  scoreTelefunSession,
} from "../routes/telefun/sessionFinalizer";
import type {
  SessionMetrics,
  TelefunScoreResult,
  VoiceQualityAssessment,
} from "@trainers/types";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";

// Mock remuxRecording so tests don't hit the actual API
vi.mock("../routes/telefun/services/telefun-recording-remux-service", () => ({
  remuxRecording: vi.fn(async () => ({
    success: true,
    data: { remuxed: true, recordings: {} },
  })),
}));

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

  it("keeps WebRTC lifecycle server-owned and does not start client scoring", async () => {
    const metrics = baseMetrics();
    const patchSession = vi.fn(async () => {});
    const finalizeRecording = vi.fn(async () => {});
    const remuxRecording = vi.fn(async () => ({
      success: true,
      data: {
        remuxed: true,
        recordings: {
          "550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/full_call.webm": {
            originalPath:
              "550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/full_call.webm",
            seekablePath:
              "550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/full_call.seekable.webm",
            remuxed: true,
          },
          "550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/agent_only.webm": {
            originalPath:
              "550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/agent_only.webm",
            seekablePath:
              "550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/agent_only.seekable.webm",
            remuxed: true,
          },
        },
        recordingStatus: "ready" as const,
        recordingReady: true,
        scoringReady: true,
      },
    }));
    const scoreSession = vi.fn(async () => ({
      score: 9,
      feedback: "should not be called",
      assessment: mockAssessment,
    }));

    const result = await finalizeTelefunSession({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      fullBlob: new Blob(["full"]),
      agentBlob: new Blob(["agent"]),
      duration: 12,
      metrics,
      localUrl: "blob:local",
      sessionConfig: {
        telefunTransport: "openai-webrtc",
      } as TelefunAppSettings,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "550e8400-e29b-41d4-a716-446655440001"),
        uploadRecording: vi.fn(async ({ type }) =>
          `550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/${type}.webm`,
        ),
        patchSession,
        finalizeRecording,
        remuxRecording,
        scoreSession,
      },
    });

    expect(patchSession).toHaveBeenCalledTimes(1);
    expect(patchSession).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      { session_metrics: metrics },
    );
    expect(finalizeRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        captureStatus: "ready",
      }),
    );
    expect(remuxRecording).toHaveBeenCalledOnce();
    expect(scoreSession).not.toHaveBeenCalled();
    expect(result.scoringStatus).toBe("skipped");
  });

  it("retries a failed WebRTC recording transition with deterministic paths", async () => {
    const finalizeRecording = vi
      .fn()
      .mockRejectedValueOnce(new Error("recording state unavailable"))
      .mockResolvedValueOnce({
        recordingStatus: "uploaded" as const,
        recordingReady: false,
        scoringReady: false,
      });
    const remuxRecording = vi.fn(async () => ({
      success: true,
      data: {
        remuxed: true,
        recordingReady: true,
        recordings: {
          "550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/full_call.webm": {
            originalPath:
              "550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/full_call.webm",
            seekablePath:
              "550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/full_call.seekable.webm",
            remuxed: true,
          },
        },
      },
    }));
    const result = await saveTelefunSession({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      fullBlob: new Blob(["full"]),
      agentBlob: null,
      duration: 12,
      metrics: baseMetrics(),
      localUrl: "blob:local",
      sessionConfig: { telefunTransport: "openai-webrtc" } as TelefunAppSettings,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "550e8400-e29b-41d4-a716-446655440001"),
        uploadRecording: vi.fn(async () =>
          "550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/full_call.webm",
        ),
        patchSession: vi.fn(async () => undefined),
        finalizeRecording,
        remuxRecording,
        scoreSession: vi.fn(),
      },
    });

    expect(finalizeRecording).toHaveBeenCalledTimes(2);
    expect(finalizeRecording).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        recordingPath:
          "550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440000/full_call.webm",
      }),
    );
    expect(result.saveFailed).toBe(false);
    expect(remuxRecording).toHaveBeenCalledOnce();
  });

  it("marks a persistent recording transition failure as unsaved and does not remux an unpersisted upload", async () => {
    const finalizeRecording = vi.fn(async () => {
      throw new Error("recording state unavailable");
    });
    const remuxRecording = vi.fn();
    const result = await saveTelefunSession({
      sessionId: "session-recording-transition-fails",
      fullBlob: new Blob(["full"]),
      agentBlob: null,
      duration: 12,
      metrics: baseMetrics(),
      localUrl: "blob:local",
      sessionConfig: { telefunTransport: "openai-webrtc" } as TelefunAppSettings,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async () => "user-1/session-recording-transition-fails/full_call.webm"),
        patchSession: vi.fn(async () => undefined),
        finalizeRecording,
        remuxRecording,
        scoreSession: vi.fn(),
      },
    });

    expect(result.saveFailed).toBe(true);
    expect(result.recordingPath).toBe(
      "user-1/session-recording-transition-fails/full_call.webm",
    );
    expect(remuxRecording).not.toHaveBeenCalled();
  });

  it("reports explicit non-retryable recording removal as a save failure", async () => {
    const result = await saveTelefunSession({
      sessionId: "session-non-retryable-recording",
      fullBlob: new Blob(["full"]),
      agentBlob: null,
      duration: 12,
      metrics: baseMetrics(),
      localUrl: "blob:local",
      sessionConfig: { telefunTransport: "openai-webrtc" } as TelefunAppSettings,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async () => "user-1/session-non-retryable-recording/full_call.webm"),
        patchSession: vi.fn(async () => undefined),
        finalizeRecording: vi.fn(async () => {
          throw Object.assign(new Error("ownership rejected"), { code: "400" });
        }),
        remuxRecording: vi.fn(),
        scoreSession: vi.fn(),
      },
    });

    expect(result.saveFailed).toBe(true);
    expect(result.remuxed).toBe(false);
  });

  it("keeps scoring unavailable when full capture fails but agent upload succeeds", async () => {
    const finalizeRecording = vi.fn(async () => ({
      recordingStatus: "failed" as const,
      recordingReady: false,
      scoringReady: false,
      scoringStatus: "pending" as const,
    }));
    const remuxRecording = vi.fn(async () => ({
      success: false,
      error: "capture latch",
    }));

    const result = await saveTelefunSession({
      sessionId: "session-full-capture-fails",
      fullBlob: new Blob(["full"]),
      agentBlob: new Blob(["agent"]),
      duration: 12,
      metrics: baseMetrics(),
      localUrl: "blob:local",
      captureStatus: "ready",
      sessionConfig: { telefunTransport: "openai-webrtc" } as TelefunAppSettings,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async ({ type }) => {
          if (type === "full_call") throw new Error("full upload failed");
          return "user-1/session-full-capture-fails/agent_only.webm";
        }),
        patchSession: vi.fn(async () => undefined),
        finalizeRecording,
        remuxRecording,
        scoreSession: vi.fn(),
      },
    });

    expect(finalizeRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        agentRecordingPath:
          "user-1/session-full-capture-fails/agent_only.webm",
        captureStatus: "failed",
      }),
    );
    expect(result.uploadFailed).toBe(true);
    expect(result.scoringReady).toBe(false);
    expect(result.saveFailed).toBe(true);
  });

  it("reports failed WebRTC capture without mutating server-owned lifecycle fields", async () => {
    const patchSession = vi.fn(async () => {});
    const finalizeRecording = vi.fn(async () => {});
    const scoreSession = vi.fn();

    await saveTelefunSession({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      fullBlob: null,
      agentBlob: null,
      duration: 0,
      metrics: baseMetrics(),
      localUrl: null,
      sessionConfig: {
        telefunTransport: "openai-webrtc",
      } as TelefunAppSettings,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "550e8400-e29b-41d4-a716-446655440001"),
        uploadRecording: vi.fn(),
        patchSession,
        finalizeRecording,
        remuxRecording: vi.fn(),
        scoreSession,
      },
    });

    expect(patchSession).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      { session_metrics: expect.any(Object) },
    );
    expect(finalizeRecording).toHaveBeenCalledWith(
      expect.objectContaining({ captureStatus: "failed" }),
    );
    expect(scoreSession).not.toHaveBeenCalled();
  });

  it("uploads, finalizes, remuxes then scores in correct order", async () => {
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
        remuxRecording: vi.fn(async () => {
          calls.push("remux");
          return {
            success: true,
            data: { remuxed: true, recordings: {} },
          };
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

    // Order: upload → patch → finalize → remux → score → patch(score)
    // remux is auto-mocked, not tracked in calls
    expect(calls).toEqual([
      "upload:full_call",
      "upload:agent_only",
      "patch",
      "finalize",
      "remux",
      "score",
      "patch",
    ]);
    expect(result.record.score).toBe(8);
    expect(result.record.feedback).toBe("Bagus");
    expect(result.scoringStatus).toBe("succeeded");
  });

  it("marks remuxed=true when remux succeeds and uses empty url (signed URL fallback)", async () => {
    const result = await finalizeTelefunSession({
      sessionId: "session-remuxed",
      fullBlob: new Blob(["full"]),
      agentBlob: new Blob(["agent"]),
      duration: 12,
      metrics: baseMetrics(),
      localUrl: "blob:local",
      sessionConfig: null,
      scenarioTitle: "Test",
      consumerName: "Test",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async () => "path"),
        patchSession: vi.fn(async () => {}),
        finalizeRecording: vi.fn(async () => {}),
        scoreSession: vi.fn(async () => ({
          score: 8,
          feedback: "Bagus",
          assessment: mockAssessment,
        })),
      },
    });

    expect(result.remuxed).toBe(true);
    // When remuxed, url is empty (ReviewModal will fetch signed URL via API)
    expect(result.record.url).toBe("");
  });

  it("falls back to blob url when remux fails", async () => {
    const remuxMock = (
      await import("../routes/telefun/services/telefun-recording-remux-service")
    ).remuxRecording as any;
    remuxMock.mockResolvedValue({
      success: false,
      error: "FFmpeg not available",
    });

    const result = await finalizeTelefunSession({
      sessionId: "session-remux-fail",
      fullBlob: new Blob(["full"]),
      agentBlob: new Blob(["agent"]),
      duration: 12,
      metrics: baseMetrics(),
      localUrl: "blob:fallback",
      sessionConfig: null,
      scenarioTitle: "Test",
      consumerName: "Test",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async () => "path"),
        patchSession: vi.fn(async () => {}),
        finalizeRecording: vi.fn(async () => {}),
        scoreSession: vi.fn(async () => ({
          score: 8,
          feedback: "Bagus",
          assessment: mockAssessment,
        })),
      },
    });

    expect(result.remuxed).toBe(false);
    expect(result.saveFailed).toBe(false);
    expect(result.record.url).toBe("blob:fallback");
  });

  it("uses the persistent player URL when full-call remux succeeds partially", async () => {
    const fullPath = "user-1/session-partial/full_call.webm";
    const agentPath = "user-1/session-partial/agent_only.webm";
    const result = await finalizeTelefunSession({
      sessionId: "session-partial",
      fullBlob: new Blob(["full"]),
      agentBlob: new Blob(["agent"]),
      duration: 12,
      metrics: baseMetrics(),
      localUrl: "blob:stale",
      sessionConfig: null,
      scenarioTitle: "Test",
      consumerName: "Test",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async ({ type }) =>
          type === "full_call" ? fullPath : agentPath,
        ),
        patchSession: vi.fn(async () => {}),
        finalizeRecording: vi.fn(async () => {}),
        remuxRecording: vi.fn(async () => ({
          success: true,
          data: {
            remuxed: false,
            recordings: {
              [fullPath]: {
                originalPath: fullPath,
                seekablePath: "user-1/session-partial/full_call.seekable.webm",
                remuxed: true,
              },
              [agentPath]: {
                originalPath: agentPath,
                remuxed: false,
              },
            },
          },
        })),
        scoreSession: vi.fn(async () => ({
          score: 8,
          feedback: "Bagus",
          assessment: mockAssessment,
        })),
      },
    });

    expect(result.remuxed).toBe(true);
    expect(result.record.url).toBe("");
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
    expect(result.scoringStatus).toBe("succeeded");
  });

  it("skips scoring when an agent recording path is unavailable", async () => {
    const scoreSession = vi.fn(
      async (): Promise<TelefunScoreResult> => ({
        score: 8,
        feedback: "Tidak dipakai",
        assessment: mockAssessment,
      }),
    );

    const result = await finalizeTelefunSession({
      sessionId: "session-no-agent-recording",
      fullBlob: null,
      agentBlob: null,
      duration: 15,
      metrics: baseMetrics(),
      localUrl: null,
      sessionConfig: null,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async () => "unused"),
        patchSession: vi.fn(async () => {}),
        finalizeRecording: vi.fn(async () => {}),
        scoreSession,
      },
    });

    expect(result.scoringStatus).toBe("skipped");
    expect(scoreSession).not.toHaveBeenCalled();
  });

  it("marks scoring failed only when the score boundary rejects an attempted response", async () => {
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

    expect(result.scoringStatus).toBe("failed");
    expect(result.record.voiceAssessment).toBeUndefined();
    expect(result.record.score).toBeUndefined();
  });

  it("marks upload failure and skips scoring when user id is unavailable", async () => {
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
    expect(result.scoringStatus).toBe("skipped");
    expect(result.saveFailed).toBe(false);
    expect(result.record.recordingPath).toBeUndefined();
    expect(result.record.agentRecordingPath).toBeUndefined();
  });

  it("keeps saveFailed and skipped scoring in the public return contract when base patch fails", async () => {
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
    expect(result.scoringStatus).toBe("skipped");
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

  it("seeds the recording transition scoringStatus into the saved record before polling starts", async () => {
    const result = await saveTelefunSession({
      sessionId: "session-seeded-status",
      fullBlob: new Blob(["full"]),
      agentBlob: null,
      duration: 12,
      metrics: baseMetrics(),
      localUrl: "blob:local",
      sessionConfig: { telefunTransport: "openai-webrtc" } as TelefunAppSettings,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(
          async () => "user-1/session-seeded-status/full_call.webm",
        ),
        patchSession: vi.fn(async () => undefined),
        finalizeRecording: vi.fn(async () => ({
          recordingStatus: "ready" as const,
          recordingReady: true,
          scoringReady: true,
          scoringStatus: "processing" as const,
        })),
        remuxRecording: vi.fn(async () => ({
          success: true,
          data: {
            remuxed: true,
            recordings: {
              "user-1/session-seeded-status/full_call.webm": {
                originalPath: "user-1/session-seeded-status/full_call.webm",
                seekablePath:
                  "user-1/session-seeded-status/full_call.seekable.webm",
                remuxed: true,
              },
            },
            recordingReady: true,
          },
        })),
        scoreSession: vi.fn(),
      },
    });

    expect(result.record.scoringStatus).toBe("processing");
    expect(result.record.score).toBeUndefined();
    expect(result.record.feedback).toBe("");
  });

  it("prefers the remux scoringStatus when the transition carried none", async () => {
    const result = await saveTelefunSession({
      sessionId: "session-remux-seeded-status",
      fullBlob: new Blob(["full"]),
      agentBlob: null,
      duration: 12,
      metrics: baseMetrics(),
      localUrl: "blob:local",
      sessionConfig: { telefunTransport: "openai-webrtc" } as TelefunAppSettings,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(
          async () => "user-1/session-remux-seeded-status/full_call.webm",
        ),
        patchSession: vi.fn(async () => undefined),
        finalizeRecording: vi.fn(async () => ({
          recordingStatus: "uploaded" as const,
          recordingReady: false,
          scoringReady: false,
        })),
        remuxRecording: vi.fn(async () => ({
          success: true,
          data: {
            remuxed: true,
            recordings: {
              "user-1/session-remux-seeded-status/full_call.webm": {
                originalPath:
                  "user-1/session-remux-seeded-status/full_call.webm",
                seekablePath:
                  "user-1/session-remux-seeded-status/full_call.seekable.webm",
                remuxed: true,
              },
            },
            recordingReady: true,
            scoringReady: true,
            scoringStatus: "completed" as const,
          },
        })),
        scoreSession: vi.fn(),
      },
    });

    expect(result.record.scoringStatus).toBe("completed");
  });

  it("marks the finalized record completed when client scoring succeeds", async () => {
    const result = await finalizeTelefunSession({
      sessionId: "session-finalize-completed",
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
        patchSession: vi.fn(async () => {}),
        finalizeRecording: vi.fn(async () => {}),
        scoreSession: vi.fn(async () => ({
          score: 8,
          feedback: "Bagus",
          assessment: { ...mockAssessment, overallScore: 8 },
        })),
      },
    });

    expect(result.record.scoringStatus).toBe("completed");
    expect(result.record.score).toBe(8);
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

  it("resolves save/remux before a deferred scoring phase completes", async () => {
    const scoring = createDeferred<TelefunScoreResult>();
    const scoreSession = vi.fn(() => scoring.promise);

    const saved = await saveTelefunSession({
      sessionId: "session-post-navigation",
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
        uploadRecording: vi.fn(
          async () => "user-1/session-post-navigation/agent_only.webm",
        ),
        patchSession: vi.fn(async () => {}),
        finalizeRecording: vi.fn(async () => {}),
        remuxRecording: vi.fn(async () => ({
          success: true,
          data: { remuxed: true, recordings: {} },
        })),
        scoreSession,
      },
    });

    let scoringResolved = false;
    const scoringPromise = scoreTelefunSession({
      sessionId: "session-post-navigation",
      agentRecordingPath: saved.agentRecordingPath,
      dependencies: {
        scoreSession,
        patchSession: vi.fn(async () => {}),
      },
    }).then((result) => {
      scoringResolved = true;
      return result;
    });

    await Promise.resolve();
    expect(saved.record.score).toBeUndefined();
    expect(scoreSession).toHaveBeenCalledTimes(1);
    expect(scoringResolved).toBe(false);

    scoring.resolve({
      score: 8,
      feedback: "Bagus",
      assessment: mockAssessment,
    });
    await expect(scoringPromise).resolves.toMatchObject({
      scoringStatus: "succeeded",
      score: 8,
    });
  });
});
