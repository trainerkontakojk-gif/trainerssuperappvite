import { describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
  env: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  },
}));

import { TranscriptCollector } from "../transcript.js";
import {
  createOpenAIUsageAccumulator,
  summarizeOpenAIUsageAccumulator,
} from "../usage.js";
import { SidebandEventObserver } from "./sideband-event-observer.js";

const USAGE = {
  input_tokens: 10,
  output_tokens: 4,
  total_tokens: 14,
  input_token_details: { text_tokens: 10, audio_tokens: 0, cached_tokens: 0 },
  output_token_details: { text_tokens: 4, audio_tokens: 0 },
};

describe("WebRTC sideband observer", () => {
  it("deduplicates transcript and response usage events without throwing", () => {
    const transcript = new TranscriptCollector(0);
    const usage = createOpenAIUsageAccumulator();
    const observer = new SidebandEventObserver({ transcript, usage });

    observer.observe({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "input-1",
      transcript: "Halo",
    });
    observer.observe({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "input-1",
      transcript: "Halo",
    });
    observer.observe({
      type: "response.output_audio_transcript.delta",
      event_id: "delta-1",
      item_id: "output-1",
      delta: "Selamat ",
    });
    observer.observe({
      type: "response.output_audio_transcript.delta",
      event_id: "delta-1",
      item_id: "output-1",
      delta: "Selamat ",
    });
    observer.observe({
      type: "response.output_audio_transcript.done",
      item_id: "output-1",
      transcript: "Selamat pagi",
    });
    observer.observe({
      type: "response.done",
      response: { id: "response-1", status: "completed", usage: USAGE },
    });
    observer.observe({
      type: "response.done",
      response: { id: "response-1", status: "completed", usage: USAGE },
    });
    expect(() =>
      observer.observe({ type: "future.event", secret: "hidden" }),
    ).not.toThrow();

    transcript.flush(100);
    expect(transcript.snapshot()).toEqual([
      { speaker: "agent", text: "Halo", startMs: expect.any(Number) },
      { speaker: "consumer", text: "Selamat", startMs: expect.any(Number) },
    ]);
    expect(summarizeOpenAIUsageAccumulator(usage)).toMatchObject({
      responseCount: 1,
      inputTokens: 10,
      outputTokens: 4,
    });
  });

  it("emits a redacted provider-error signal for a bounded sideband error", () => {
    const providerError = vi.fn();
    const diagnostics: unknown[] = [];
    const observer = new SidebandEventObserver({
      transcript: new TranscriptCollector(0),
      usage: createOpenAIUsageAccumulator(),
      onProviderError: providerError,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    observer.observe({
      type: "error",
      error: {
        type: "server_error",
        code: "internal_error",
        param: "audio_end_ms",
        message: "secret provider configuration details",
      },
    });

    expect(providerError).toHaveBeenCalledWith({
      code: "internal_error",
      param: "audio_end_ms",
    });
    expect(diagnostics).toContainEqual({
      type: "provider_error",
      code: "internal_error",
      param: "audio_end_ms",
    });
    expect(JSON.stringify(providerError.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(diagnostics)).not.toContain("secret");
  });

  it("drops unbounded provider params while retaining the safe error code", () => {
    const providerError = vi.fn();
    const observer = new SidebandEventObserver({
      transcript: new TranscriptCollector(0),
      usage: createOpenAIUsageAccumulator(),
      onProviderError: providerError,
    });

    observer.observe({
      type: "error",
      error: {
        type: "invalid_request_error",
        code: "invalid_value",
        param: "non_allowlisted_provider_field",
      },
    });

    expect(providerError).toHaveBeenCalledWith({ code: "invalid_value" });
    expect(JSON.stringify(providerError.mock.calls)).not.toContain("secret");
  });

  it("reports bounded diagnostics without raw provider payloads", () => {
    const transcript = new TranscriptCollector(0);
    const diagnostics: unknown[] = [];
    const observer = new SidebandEventObserver({
      transcript,
      usage: createOpenAIUsageAccumulator(),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      maxDedupeEntries: 1,
    });

    observer.observe({ type: "future.event", secret: "sideband-secret" });
    observer.observe({
      type: "response.done",
      response: { id: "response-1", status: "cancelled" },
    });
    observer.observe({
      type: "response.done",
      response: { id: "response-2", status: "failed" },
    });
    observer.observe({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item-1",
      transcript: "one",
    });
    observer.observe({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item-2",
      transcript: "two",
    });

    expect(diagnostics).toContainEqual({
      type: "unknown_event",
      eventType: "future.event",
    });
    expect(diagnostics).toContainEqual({
      type: "response_not_completed",
      responseId: "response-1",
      status: "cancelled",
    });
    expect(diagnostics).toContainEqual({
      type: "observer_capacity_exceeded",
      scope: "response_ids",
      limit: 1,
    });
    expect(JSON.stringify(diagnostics)).not.toContain("sideband-secret");
  });

  it("observes tool IDs only and never executes or forwards tool payloads", () => {
    const transcript = new TranscriptCollector(0);
    const onToolEvent = vi.fn();
    const observer = new SidebandEventObserver({
      transcript,
      usage: createOpenAIUsageAccumulator(),
      onToolEvent,
    });

    observer.observe({
      type: "response.function_call_arguments.delta",
      response_id: "response-tool",
      call_id: "call-tool",
      delta: "{}",
    });
    observer.observe({
      type: "response.function_call_arguments.done",
      response_id: "response-tool",
      call_id: "call-tool",
      name: "lookup_ticket",
      arguments: "{}",
    });

    expect(onToolEvent).toHaveBeenCalledTimes(2);
    expect(onToolEvent).toHaveBeenLastCalledWith({
      phase: "done",
      responseId: "response-tool",
      callId: "call-tool",
      name: "lookup_ticket",
      arguments: "{}",
    });
    expect(transcript.snapshot()).toEqual([]);
  });

  it("merges duplicate unordered output transcript events without duplicate entries", () => {
    const transcript = new TranscriptCollector(0);
    const observer = new SidebandEventObserver({
      transcript,
      usage: createOpenAIUsageAccumulator(),
    });

    observer.observe({
      type: "response.output_audio_transcript.done",
      item_id: "output-out-of-order",
      transcript: "Selamat pagi",
    });
    observer.observe({
      type: "response.output_audio_transcript.delta",
      item_id: "output-out-of-order",
      delta: "Selamat ",
    });
    transcript.completeTurn("consumer");
    observer.observe({
      type: "response.output_audio_transcript.delta",
      item_id: "output-duplicate",
      delta: "Halo",
    });
    observer.observe({
      type: "response.output_audio_transcript.delta",
      item_id: "output-duplicate",
      delta: "Halo",
    });
    observer.observe({
      type: "response.output_audio_transcript.done",
      item_id: "output-duplicate",
      transcript: "Halo",
    });

    transcript.flush(100);
    expect(transcript.snapshot()).toEqual([
      {
        speaker: "consumer",
        text: "Selamat pagi",
        startMs: expect.any(Number),
      },
      { speaker: "consumer", text: "Halo", startMs: expect.any(Number) },
    ]);
  });
});
