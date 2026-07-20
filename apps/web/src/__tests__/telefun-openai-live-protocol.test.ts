import { describe, expect, it } from "vitest";
import * as protocolModule from "../routes/telefun/services/liveProtocol";

const protocol = protocolModule as Record<string, any>;

function requireProtocolFunction(name: string) {
  expect(protocol[name], `${name} must be exported`).toBeTypeOf("function");
  return protocol[name] as (...args: any[]) => any;
}

describe("Telefun provider protocol modules", () => {
  it("keeps the compatibility barrel and focused modules importable", async () => {
    await expect(
      import("../routes/telefun/services/liveProtocol/common"),
    ).resolves.toHaveProperty("buildTelefunAuthMessage");
    await expect(
      import("../routes/telefun/services/liveProtocol/gemini"),
    ).resolves.toHaveProperty("buildTelefunLiveSetupMessage");
    await expect(
      import("../routes/telefun/services/liveProtocol/openai"),
    ).resolves.toHaveProperty("parseOpenAiRealtimeEvent");
    await expect(
      import("../routes/telefun/services/liveProtocol/index"),
    ).resolves.toHaveProperty("buildRealtimeAudioMessage");
  });

  it("builds exact provider-neutral configure envelopes from canonical metadata", () => {
    const build = requireProtocolFunction("buildTelefunSessionConfigure");

    expect(
      build({
        modelId: "gemini-3.1-flash-live-preview",
        voice: "Kore",
        instructions: "Layani nasabah sebagai konsumen.",
        responsePacingMode: "realistic",
      }),
    ).toEqual({
      type: "telefun_session_configure",
      modelId: "gemini-3.1-flash-live-preview",
      transport: "gemini-live",
      voice: "Kore",
      instructions: "Layani nasabah sebagai konsumen.",
      inputAudio: { format: "pcm16", sampleRate: 16000 },
      responsePacingMode: "realistic",
    });

    expect(
      build({
        modelId: "gpt-realtime-2.1-mini",
        voice: "marin",
        instructions: "Respond naturally.",
        responsePacingMode: "training_fast",
      }),
    ).toEqual({
      type: "telefun_session_configure",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
      voice: "marin",
      instructions: "Respond naturally.",
      inputAudio: { format: "pcm16", sampleRate: 24000 },
      responsePacingMode: "training_fast",
    });
  });

  it("rejects unknown models and provider-incompatible voices before configure", () => {
    const build = requireProtocolFunction("buildTelefunSessionConfigure");

    expect(() =>
      build({
        modelId: "unknown-model",
        voice: "Kore",
        instructions: "test",
        responsePacingMode: "realistic",
      }),
    ).toThrow(/model/i);
    expect(() =>
      build({
        modelId: "gpt-realtime-2.1",
        voice: "Kore",
        instructions: "test",
        responsePacingMode: "realistic",
      }),
    ).toThrow(/voice/i);
    expect(() =>
      build({
        modelId: "gemini-3.1-flash-live-preview",
        voice: "marin",
        instructions: "test",
        responsePacingMode: "realistic",
      }),
    ).toThrow(/voice/i);
  });

  it("does not emit secret, authorization, header, or API key fields", () => {
    const configure = requireProtocolFunction("buildTelefunSessionConfigure")({
      modelId: "gpt-realtime-2.1",
      voice: "cedar",
      instructions: "test",
      responsePacingMode: "realistic",
    });
    const append = requireProtocolFunction("buildOpenAiInputAudioAppend")(
      new Uint8Array([1, 2, 3]).buffer,
    );
    const item = requireProtocolFunction("buildOpenAiTextInputItem")("halo");

    const serialized = JSON.stringify([configure, append, item]).toLowerCase();
    expect(serialized).not.toMatch(
      /api[_-]?key|authorization|bearer|secret|headers?|token/,
    );
  });
});

describe("OpenAI Realtime data-plane helpers", () => {
  it("builds input_audio_buffer.append with base64 PCM bytes", () => {
    const build = requireProtocolFunction("buildOpenAiInputAudioAppend");
    const pcm = new Uint8Array([0, 1, 254, 255]);

    expect(build(pcm.buffer)).toEqual({
      type: "input_audio_buffer.append",
      audio: Buffer.from(pcm).toString("base64"),
    });
  });

  it("builds text input followed by response.create", () => {
    const buildText = requireProtocolFunction("buildOpenAiTextInputItem");
    const buildResponse = requireProtocolFunction("buildOpenAiResponseCreate");

    expect(buildText("Halo, ada yang bisa dibantu?")).toEqual({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Halo, ada yang bisa dibantu?" }],
      },
    });
    expect(buildResponse()).toEqual({ type: "response.create" });
  });

  it("builds response.cancel and exact conversation.item.truncate events", () => {
    const cancel = requireProtocolFunction("buildOpenAiResponseCancel");
    const truncate = requireProtocolFunction(
      "buildOpenAiConversationItemTruncate",
    );

    expect(cancel()).toEqual({ type: "response.cancel" });
    expect(truncate({ itemId: "item-1", audioEndMs: 15.6 })).toEqual({
      type: "conversation.item.truncate",
      item_id: "item-1",
      content_index: 0,
      audio_end_ms: 16,
    });
    expect(truncate({ itemId: "item-1", audioEndMs: -10 })).toMatchObject({
      content_index: 0,
      audio_end_ms: 0,
    });
    expect(
      truncate({ itemId: "item-1", audioEndMs: Number.POSITIVE_INFINITY }),
    ).toMatchObject({ content_index: 0, audio_end_ms: 0 });
  });

  it("normalizes session, speech, and response lifecycle events", () => {
    const parse = requireProtocolFunction("parseOpenAiRealtimeEvent");

    expect(
      parse({
        type: "session.created",
        session: { id: "sess-1", model: "gpt-realtime-2.1" },
      }),
    ).toEqual({
      kind: "session_created",
      sessionId: "sess-1",
      model: "gpt-realtime-2.1",
    });
    expect(
      parse({
        type: "session.updated",
        session: { id: "sess-1", model: "gpt-realtime-2.1" },
      }),
    ).toEqual({
      kind: "session_updated",
      sessionId: "sess-1",
      model: "gpt-realtime-2.1",
    });
    expect(
      parse({
        type: "input_audio_buffer.speech_started",
        audio_start_ms: 120,
        item_id: "item-user-1",
      }),
    ).toEqual({
      kind: "speech_started",
      audioStartMs: 120,
      itemId: "item-user-1",
    });
    expect(
      parse({
        type: "input_audio_buffer.speech_stopped",
        audio_end_ms: 870,
        item_id: "item-user-1",
      }),
    ).toEqual({
      kind: "speech_stopped",
      audioEndMs: 870,
      itemId: "item-user-1",
    });
    expect(
      parse({
        type: "response.created",
        response: { id: "resp-1", status: "in_progress" },
      }),
    ).toEqual({
      kind: "response_created",
      responseId: "resp-1",
      status: "in_progress",
    });
  });

  it("normalizes output audio delta to PCM bytes at 24 kHz", () => {
    const parse = requireProtocolFunction("parseOpenAiRealtimeEvent");
    const pcm = new Uint8Array([1, 2, 3, 4]);

    expect(
      parse({
        type: "response.output_audio.delta",
        response_id: "resp-1",
        item_id: "item-ai-1",
        delta: Buffer.from(pcm).toString("base64"),
      }),
    ).toEqual({
      kind: "audio_delta",
      responseId: "resp-1",
      itemId: "item-ai-1",
      data: pcm,
      sampleRate: 24000,
    });
  });

  it("normalizes transcript delta/done and response.done usage", () => {
    const parse = requireProtocolFunction("parseOpenAiRealtimeEvent");

    expect(
      parse({
        type: "response.output_audio_transcript.delta",
        response_id: "resp-1",
        item_id: "item-ai-1",
        delta: "Halo",
      }),
    ).toEqual({
      kind: "transcript_delta",
      responseId: "resp-1",
      itemId: "item-ai-1",
      delta: "Halo",
    });
    expect(
      parse({
        type: "response.output_audio_transcript.done",
        response_id: "resp-1",
        item_id: "item-ai-1",
        transcript: "Halo dunia",
      }),
    ).toEqual({
      kind: "transcript_done",
      responseId: "resp-1",
      itemId: "item-ai-1",
      transcript: "Halo dunia",
    });

    const usage = {
      total_tokens: 12,
      input_tokens: 7,
      output_tokens: 5,
    };
    expect(
      parse({
        type: "response.done",
        response: { id: "resp-1", status: "completed", usage },
      }),
    ).toEqual({
      kind: "turn_complete",
      responseId: "resp-1",
      status: "completed",
      usage,
    });
  });

  it("normalizes cancellation and safe provider errors", () => {
    const parse = requireProtocolFunction("parseOpenAiRealtimeEvent");

    expect(
      parse({ type: "response.cancelled", response_id: "resp-1" }),
    ).toEqual({ kind: "response_cancelled", responseId: "resp-1" });
    expect(
      parse({
        type: "error",
        error: {
          type: "invalid_request_error",
          code: "invalid_event",
          message: "The event was invalid.",
          internal_debug: "must not pass through",
        },
      }),
    ).toEqual({
      kind: "error",
      errorType: "invalid_request_error",
      code: "invalid_event",
      message: "The event was invalid.",
    });
  });

  it("returns explicit invalid or unknown results without throwing or executing tools", () => {
    const parse = requireProtocolFunction("parseOpenAiRealtimeEvent");

    expect(parse("not-json")).toEqual({ kind: "invalid" });
    expect(parse({ type: 123 })).toEqual({ kind: "invalid" });
    expect(parse({ type: "" })).toEqual({ kind: "invalid" });
    expect(
      parse({
        type: "response.function_call_arguments.done",
        name: "dangerous_tool",
        arguments: '{"command":"do not execute"}',
      }),
    ).toEqual({
      kind: "unknown",
      eventType: "response.function_call_arguments.done",
    });
    expect(parse({ type: "future.event", raw_prompt: "secret" })).toEqual({
      kind: "unknown",
      eventType: "future.event",
    });
  });
});
