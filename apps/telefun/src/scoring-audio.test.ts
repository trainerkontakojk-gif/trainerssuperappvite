import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";

const mockSelect = vi.fn();
const mockDownload = vi.fn();
const mockQueryClaimedProcessingSession = vi.fn();
const mockExecFile = vi.fn();

vi.mock("node:child_process", async () => {
  const fs = await import("node:fs");
  return {
    execFile: (cmd: string, args: string[], opts: unknown, cb?: any) => {
      if (typeof opts === "function") cb = opts;
      const outPath = args[args.length - 1];
      if (typeof outPath === "string") {
        try {
          fs.writeFileSync(outPath, Buffer.from("pcm-output-bytes"));
        } catch {
          /* ignore */
        }
      }
      process.nextTick(() => cb && cb(null, Buffer.from("pcm"), ""));
      mockExecFile(cmd, args, opts, cb);
      return {} as any;
    },
    execFileSync: vi.fn(() => Buffer.from("pcm")),
  };
});

vi.mock("./db.js", () => ({
  queryClaimedProcessingSession: (...args: any[]) =>
    mockQueryClaimedProcessingSession(...args),
}));

vi.mock("./env.js", () => ({
  env: {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({ select: mockSelect })),
    storage: { from: vi.fn(() => ({ download: mockDownload })) },
  })),
}));

const { getOpenAIScoringInput, convertWebMToPcm24kMono } =
  await import("./scoring-audio.js");

afterEach(() => {
  vi.clearAllMocks();
});

describe("getOpenAIScoringInput", () => {
  it("rejects a model mismatch before downloading storage", async () => {
    mockQueryClaimedProcessingSession.mockResolvedValue({
      id: "s1",
      user_id: "u1",
      scenario_title: "S",
      agent_recording_path: "recordings/s1.webm",
      telefun_model_id: "gpt-realtime-2.1",
      scoring_status: "processing",
    });
    await expect(
      getOpenAIScoringInput({
        sessionId: "s1",
        userId: "u1",
        modelId: "gpt-realtime-2.1-mini",
      }),
    ).rejects.toMatchObject({ code: "MODEL_MISMATCH" });
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("rejects a non-processing session", async () => {
    mockQueryClaimedProcessingSession.mockResolvedValue({
      id: "s1",
      user_id: "u1",
      scenario_title: "S",
      agent_recording_path: "recordings/s1.webm",
      telefun_model_id: "gpt-realtime-2.1",
      scoring_status: "completed",
    });
    await expect(
      getOpenAIScoringInput({
        sessionId: "s1",
        userId: "u1",
        modelId: "gpt-realtime-2.1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("loads only the stored agent recording for a matched processing session", async () => {
    mockQueryClaimedProcessingSession.mockResolvedValue({
      id: "s1",
      user_id: "u1",
      scenario_title: "Scenario A",
      agent_recording_path: "recordings/s1.webm",
      telefun_model_id: "gpt-realtime-2.1",
      scoring_status: "processing",
    });
    mockDownload.mockResolvedValue({
      data: new Blob([Buffer.from("webm-bytes")]),
      error: null,
    });

    const result = await getOpenAIScoringInput({
      sessionId: "s1",
      userId: "u1",
      modelId: "gpt-realtime-2.1",
    });

    expect(result).toMatchObject({
      scenarioTitle: "Scenario A",
      agentRecordingPath: "recordings/s1.webm",
    });
    expect(Buffer.isBuffer(result.audio)).toBe(true);
    expect(mockDownload).toHaveBeenCalledWith("recordings/s1.webm");
  });
});

describe("convertWebMToPcm24kMono", () => {
  it("converts WebM to signed PCM16 mono at 24 kHz and cleans temp files", async () => {
    const before = readdirSync(tmpdir()).filter((name) =>
      name.startsWith("telefun-score-"),
    );
    await convertWebMToPcm24kMono(Buffer.from("webm"));
    expect(mockExecFile).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining(["-ac", "1", "-ar", "24000", "-f", "s16le"]),
      expect.objectContaining({ timeout: 30_000 }),
      expect.any(Function),
    );
    expect(
      readdirSync(tmpdir()).filter((name) => name.startsWith("telefun-score-")),
    ).toEqual(before);
  });
});
