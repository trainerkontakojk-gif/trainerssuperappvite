import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("./env.js", () => ({
  env: {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

import {
  evaluateOpenAIVoiceAssessment,
  type OpenAISocketFactory,
  SCORING_FUNCTION_NAME,
  MAX_AUDIO_CHUNK_BYTES,
} from "./openai-voice-assessment.js";
import type { OpenAIRealtimeSocketLike } from "./providers/OpenAIRealtimeAdapter.js";
import { parseVoiceQualityAssessment } from "@trainers/types";

class FakeOpenAISocket
  extends EventEmitter
  implements OpenAIRealtimeSocketLike
{
  readyState = 0;
  sent: string[] = [];
  url = "";
  open = vi.fn(() => {
    this.readyState = 1;
    this.emit("open");
  });
  send = vi.fn((message: string) => {
    this.sent.push(message);
  });
  close = vi.fn((code?: number, reason?: string) => {
    this.readyState = 3;
    this.emit("close", code ?? 1000, Buffer.from(reason ?? ""));
  });
  terminate = vi.fn(() => {
    this.readyState = 3;
  });
  ping = vi.fn();
  receive(raw: unknown) {
    this.emit("message", { toString: () => JSON.stringify(raw) });
  }
}

function lastSessionUpdate(socket: FakeOpenAISocket): any {
  const updates = socket.sent
    .map((s) => JSON.parse(s))
    .filter((m) => m.type === "session.update");
  return updates[updates.length - 1];
}

function findFunctionTool(socket: FakeOpenAISocket): any {
  const session = lastSessionUpdate(socket);
  const tool = session?.session?.tools?.find(
    (t: any) => t.name === SCORING_FUNCTION_NAME,
  );
  return tool;
}

function priceableUsage(inputTokens: number, outputTokens: number) {
  return {
    total_tokens: inputTokens + outputTokens,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    input_token_details: {
      text_tokens: 0,
      audio_tokens: inputTokens,
      cached_tokens: 0,
      cached_tokens_details: { text_tokens: 0, audio_tokens: 0 },
    },
    output_token_details: { text_tokens: outputTokens, audio_tokens: 0 },
  };
}

afterEach(() => vi.clearAllMocks());

describe("evaluateOpenAIVoiceAssessment — protocol", () => {
  it("opens a model-specific realtime socket and configures text-only evaluation", async () => {
    const socket = new FakeOpenAISocket();
    const createSocket: OpenAISocketFactory = (url) => {
      socket.url = url;
      return socket;
    };

    const promise = evaluateOpenAIVoiceAssessment({
      modelId: "gpt-realtime-2.1",
      userId: "u1",
      scenarioTitle: "Scenario A",
      pcmAudio: Buffer.from("pcm-bytes"),
      apiKey: "sk-test",
      createSocket,
    });

    socket.open();
    const sessionUpdate = lastSessionUpdate(socket);
    expect(socket.url).toBe(
      "wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1",
    );
    expect(sessionUpdate.session.output_modalities).toEqual(["text"]);
    expect(sessionUpdate.session).toMatchObject({
      type: "realtime",
      model: "gpt-realtime-2.1",
    });
    expect(sessionUpdate.session.audio.input.turn_detection).toBeNull();
    expect(findFunctionTool(socket)).toBeDefined();

    // complete the flow
    socket.receive({
      type: "session.updated",
      session: { id: "s" },
    });
    socket.receive({
      type: "response.done",
      response: {
        status: "completed",
        usage: priceableUsage(8, 2),
        output: [
          {
            type: "function_call",
            name: SCORING_FUNCTION_NAME,
            arguments: JSON.stringify(
              parseVoiceQualityAssessment({
                overallScore: 8,
                speakingRate: {
                  score: 8,
                  wordsPerMinute: 140,
                  verdict: "v",
                  feedback: "f",
                },
                intonation: { score: 8, verdict: "v", feedback: "f" },
                articulation: { score: 8, verdict: "v", feedback: "f" },
                fillerWords: {
                  score: 7,
                  count: 2,
                  examples: [],
                  verdict: "v",
                  feedback: "f",
                },
                emotionalTone: {
                  score: 8,
                  dominant: "calm",
                  verdict: "v",
                  feedback: "f",
                },
                transcript: "t",
                highlights: ["h"],
                strengths: ["s"],
              }) ?? {},
            ),
          },
        ],
      },
    });

    const { assessment, usage } = await promise;
    expect(assessment.overallScore).toBe(8);
    expect(usage.totalTokens).toBe(10);
  });

  it("routes the exact Mini model id", async () => {
    const socket = new FakeOpenAISocket();
    const createSocket: OpenAISocketFactory = (url) => {
      socket.url = url;
      return socket;
    };
    const promise = evaluateOpenAIVoiceAssessment({
      modelId: "gpt-realtime-2.1-mini",
      userId: "u1",
      scenarioTitle: "S",
      pcmAudio: Buffer.from("pcm"),
      apiKey: "sk-test",
      createSocket,
    });
    socket.open();
    expect(socket.url).toBe(
      "wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini",
    );
    socket.receive({ type: "session.updated", session: {} });
    socket.receive({
      type: "response.done",
      response: {
        status: "completed",
        usage: priceableUsage(3, 2),
        output: [
          {
            type: "function_call",
            name: SCORING_FUNCTION_NAME,
            arguments: JSON.stringify(
              parseVoiceQualityAssessment({
                overallScore: 6,
                speakingRate: {
                  score: 6,
                  wordsPerMinute: 120,
                  verdict: "v",
                  feedback: "f",
                },
                intonation: { score: 6, verdict: "v", feedback: "f" },
                articulation: { score: 6, verdict: "v", feedback: "f" },
                fillerWords: {
                  score: 6,
                  count: 1,
                  examples: [],
                  verdict: "v",
                  feedback: "f",
                },
                emotionalTone: {
                  score: 6,
                  dominant: "ok",
                  verdict: "v",
                  feedback: "f",
                },
                transcript: "t",
                highlights: ["h"],
                strengths: ["s"],
              }) ?? {},
            ),
          },
        ],
      },
    });
    await promise;
  });

  it("commits buffered audio and requests a response before evaluation", async () => {
    const socket = new FakeOpenAISocket();
    const promise = evaluateOpenAIVoiceAssessment({
      modelId: "gpt-realtime-2.1",
      userId: "u1",
      scenarioTitle: "S",
      pcmAudio: Buffer.alloc(MAX_AUDIO_CHUNK_BYTES + 1),
      apiKey: "sk-test",
      createSocket: () => socket,
    });
    socket.open();
    expect(socket.sent.map((value) => JSON.parse(value).type)).toEqual([
      "session.update",
    ]);
    socket.receive({ type: "session.updated", session: {} });
    const sentEvents = socket.sent.map((s) => JSON.parse(s));
    const sentTypes = sentEvents.map((event) => event.type);
    expect(
      sentEvents.filter((event) => event.type === "input_audio_buffer.append"),
    ).toHaveLength(2);
    expect(sentTypes).toContain("input_audio_buffer.commit");
    expect(sentTypes).toContain("response.create");
    socket.receive({
      type: "response.done",
      response: {
        status: "completed",
        usage: priceableUsage(2, 2),
        output: [
          {
            type: "function_call",
            name: SCORING_FUNCTION_NAME,
            arguments: JSON.stringify(
              parseVoiceQualityAssessment({
                overallScore: 7,
                speakingRate: {
                  score: 7,
                  wordsPerMinute: 130,
                  verdict: "v",
                  feedback: "f",
                },
                intonation: { score: 7, verdict: "v", feedback: "f" },
                articulation: { score: 7, verdict: "v", feedback: "f" },
                fillerWords: {
                  score: 7,
                  count: 0,
                  examples: [],
                  verdict: "v",
                  feedback: "f",
                },
                emotionalTone: {
                  score: 7,
                  dominant: "ok",
                  verdict: "v",
                  feedback: "f",
                },
                transcript: "t",
                highlights: ["h"],
                strengths: ["s"],
              }) ?? {},
            ),
          },
        ],
      },
    });
    await promise;
  });
});

describe("evaluateOpenAIVoiceAssessment — failure modes", () => {
  it("rejects malformed function arguments as untrusted", async () => {
    const socket = new FakeOpenAISocket();
    const promise = evaluateOpenAIVoiceAssessment({
      modelId: "gpt-realtime-2.1",
      userId: "u1",
      scenarioTitle: "S",
      pcmAudio: Buffer.from("pcm"),
      apiKey: "sk-test",
      createSocket: () => socket,
    });
    socket.open();
    socket.receive({ type: "session.updated", session: {} });
    socket.receive({
      type: "response.done",
      response: {
        status: "completed",
        usage: priceableUsage(2, 2),
        output: [
          {
            type: "function_call",
            name: SCORING_FUNCTION_NAME,
            arguments: "{ not valid json",
          },
        ],
      },
    });
    await expect(promise).rejects.toMatchObject({ code: "INVALID_ASSESSMENT" });
  });

  it("rejects an assessment with the wrong function name", async () => {
    const socket = new FakeOpenAISocket();
    const promise = evaluateOpenAIVoiceAssessment({
      modelId: "gpt-realtime-2.1",
      userId: "u1",
      scenarioTitle: "S",
      pcmAudio: Buffer.from("pcm"),
      apiKey: "sk-test",
      createSocket: () => socket,
    });
    socket.open();
    socket.receive({ type: "session.updated", session: {} });
    socket.receive({
      type: "response.done",
      response: {
        status: "completed",
        usage: priceableUsage(2, 2),
        output: [
          {
            type: "function_call",
            name: "other_tool",
            arguments: "{}",
          },
        ],
      },
    });
    await expect(promise).rejects.toMatchObject({ code: "INVALID_ASSESSMENT" });
  });

  it("rejects when upstream usage is missing", async () => {
    const socket = new FakeOpenAISocket();
    const promise = evaluateOpenAIVoiceAssessment({
      modelId: "gpt-realtime-2.1",
      userId: "u1",
      scenarioTitle: "S",
      pcmAudio: Buffer.from("pcm"),
      apiKey: "sk-test",
      createSocket: () => socket,
    });
    socket.open();
    socket.receive({ type: "session.updated", session: {} });
    socket.receive({
      type: "response.done",
      response: {
        status: "completed",
        output: [
          {
            type: "function_call",
            name: SCORING_FUNCTION_NAME,
            arguments: JSON.stringify(
              parseVoiceQualityAssessment({
                overallScore: 7,
                speakingRate: {
                  score: 7,
                  wordsPerMinute: 130,
                  verdict: "v",
                  feedback: "f",
                },
                intonation: { score: 7, verdict: "v", feedback: "f" },
                articulation: { score: 7, verdict: "v", feedback: "f" },
                fillerWords: {
                  score: 7,
                  count: 0,
                  examples: [],
                  verdict: "v",
                  feedback: "f",
                },
                emotionalTone: {
                  score: 7,
                  dominant: "ok",
                  verdict: "v",
                  feedback: "f",
                },
                transcript: "t",
                highlights: ["h"],
                strengths: ["s"],
              }) ?? {},
            ),
          },
        ],
      },
    });
    await expect(promise).rejects.toMatchObject({ code: "MISSING_USAGE" });
  });

  it("times out and terminates the socket", async () => {
    vi.useFakeTimers();
    const socket = new FakeOpenAISocket();
    const promise = evaluateOpenAIVoiceAssessment({
      modelId: "gpt-realtime-2.1",
      userId: "u1",
      scenarioTitle: "S",
      pcmAudio: Buffer.from("pcm"),
      apiKey: "sk-test",
      createSocket: () => socket,
      connectTimeoutMs: 1000,
      evaluationTimeoutMs: 2000,
    });
    socket.open();
    socket.receive({ type: "session.updated", session: {} });
    const assertion = expect(promise).rejects.toMatchObject({
      code: "EVALUATION_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
    vi.useRealTimers();
  });
});
