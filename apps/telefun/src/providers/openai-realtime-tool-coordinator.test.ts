import { describe, expect, it, vi } from "vitest";
import { RealtimeToolDispatcher } from "../tools/RealtimeToolDispatcher.js";
import { OpenAIRealtimeToolCoordinator } from "./openai-realtime-tool-coordinator.js";

function coordinator(options: { send?: (message: string) => void; max?: number } = {}) {
  const handler = vi.fn(async () => ({ status: "found" }));
  const dispatcher = new RealtimeToolDispatcher([
    {
      name: "lookup_ticket",
      description: "Look up a ticket.",
      parameters: { type: "object" },
      schema: { safeParse: (value: unknown) => ({ success: true, data: value }) } as never,
      handler,
    },
  ]);
  const diagnostics: unknown[] = [];
  const onCapacityExceeded = vi.fn();
  const coordinator = new OpenAIRealtimeToolCoordinator({
    dispatcher,
    maxToolArgumentBytes: 64 * 1024,
    maxPendingToolCalls: options.max ?? 32,
    maxToolCallsPerResponse: options.max ?? 32,
    maxToolCallsPerSession: options.max ?? 32,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    onCapacityExceeded,
    canSend: () => true,
    send: options.send ?? vi.fn(),
  });
  return { coordinator, handler, diagnostics, send: options.send, onCapacityExceeded };
}

describe("OpenAI realtime tool coordinator", () => {
  it("executes one allowlisted call and emits one output/follow-up pair", async () => {
    const sent: string[] = [];
    const harness = coordinator({ send: (message) => sent.push(message) });
    harness.coordinator.handleEvent({
      phase: "delta",
      responseId: "response-1",
      callId: "call-1",
      delta: '{"ticketId":"T-1"}',
    });
    harness.coordinator.handleEvent({
      phase: "done",
      responseId: "response-1",
      callId: "call-1",
      name: "lookup_ticket",
    });
    harness.coordinator.handleEvent({
      phase: "done",
      responseId: "response-1",
      callId: "call-1",
      name: "lookup_ticket",
    });
    expect(harness.coordinator.handleResponseDone({ responseId: "response-1", status: "completed" })).toBe(true);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(harness.handler).toHaveBeenCalledOnce();
    expect(sent.filter((message) => JSON.parse(message).type === "response.create")).toHaveLength(1);
  });

  it("fails closed when pending tool cardinality reaches its configured limit", () => {
    const harness = coordinator({ max: 1 });
    // The coordinator's public behavior is bounded; a second unique pending ID
    // is rejected without retaining another argument buffer.
    harness.coordinator.handleEvent({ phase: "delta", callId: "call-1", delta: "{}" });
    harness.coordinator.handleEvent({ phase: "delta", callId: "call-2", delta: "{}" });
    expect(harness.diagnostics).toContainEqual({
      type: "tool_argument_queue_overflow",
      pendingCalls: 1,
    });
    expect(harness.onCapacityExceeded).toHaveBeenCalledWith("pending", 1);
  });
});
