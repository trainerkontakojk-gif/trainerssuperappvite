import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  RealtimeToolDispatcher,
  createProductionRealtimeToolDispatcher,
  type RealtimeToolDefinition,
} from "./RealtimeToolDispatcher.js";

function createLookupTool(
  handler: RealtimeToolDefinition<{ ticketId: string }>["handler"] = async (
    args,
  ) => ({
    status: "found",
    ticketId: args.ticketId,
  }),
): RealtimeToolDefinition<{ ticketId: string }> {
  return {
    name: "lookup_ticket",
    description: "Look up one ticket from the Telefun test fixture.",
    parameters: {
      type: "object",
      properties: { ticketId: { type: "string", minLength: 1 } },
      required: ["ticketId"],
      additionalProperties: false,
    },
    schema: z.object({ ticketId: z.string().min(1) }).strict(),
    handler,
  };
}

describe("RealtimeToolDispatcher", () => {
  it("keeps the production allowlist empty", () => {
    const dispatcher = createProductionRealtimeToolDispatcher();

    expect(dispatcher.getDefinitions()).toEqual([]);
  });

  it("validates and executes an allowlisted tool exactly once per call ID", async () => {
    const handler = vi.fn(async (args: { ticketId: string }) => ({
      status: "found",
      ticketId: args.ticketId,
    }));
    const dispatcher = new RealtimeToolDispatcher([createLookupTool(handler)]);

    const first = dispatcher.execute({
      callId: "call_1",
      name: "lookup_ticket",
      arguments: '{"ticketId":"T-100"}',
    });
    const replay = dispatcher.execute({
      callId: "call_1",
      name: "lookup_ticket",
      arguments: { ticketId: "T-100" },
    });

    await expect(first).resolves.toEqual({
      ok: true,
      output: { status: "found", ticketId: "T-100" },
    });
    await expect(replay).resolves.toEqual({
      ok: true,
      output: { status: "found", ticketId: "T-100" },
    });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ ticketId: "T-100" });
  });

  it("rejects unknown tools without invoking another allowlisted handler", async () => {
    const handler = vi.fn();
    const dispatcher = new RealtimeToolDispatcher([createLookupTool(handler)]);

    await expect(
      dispatcher.execute({
        callId: "call_unknown",
        name: "delete_everything",
        arguments: {},
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "unknown_tool",
        message: "Tool is not available in this Telefun session",
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "call_malformed", "{not-json"],
    ["schema mismatch", "call_schema", { ticketId: "" }],
    [
      "unknown property",
      "call_unknown_property",
      { ticketId: "T-1", admin: true },
    ],
  ])(
    "returns a structured invalid-arguments result for %s",
    async (_label, callId, args) => {
      const handler = vi.fn();
      const dispatcher = new RealtimeToolDispatcher([
        createLookupTool(handler),
      ]);

      await expect(
        dispatcher.execute({
          callId,
          name: "lookup_ticket",
          arguments: args,
        }),
      ).resolves.toEqual({
        ok: false,
        error: {
          code: "invalid_arguments",
          message: "Tool arguments did not match the approved schema",
        },
      });
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("bounds serialized arguments before schema validation", async () => {
    const handler = vi.fn();
    const dispatcher = new RealtimeToolDispatcher([createLookupTool(handler)], {
      maxArgumentBytes: 16,
    });

    await expect(
      dispatcher.execute({
        callId: "call_large",
        name: "lookup_ticket",
        arguments: { ticketId: "T-123456789" },
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_arguments",
        message: "Tool arguments exceeded the safe size limit",
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("turns handler failures and non-serializable output into safe errors", async () => {
    const thrown = new RealtimeToolDispatcher([
      createLookupTool(
        vi.fn(async () => {
          throw new Error("database password=secret");
        }),
      ),
    ]);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const unserializable = new RealtimeToolDispatcher([
      createLookupTool(vi.fn(async () => cyclic)),
    ]);

    for (const [dispatcher, callId] of [
      [thrown, "call_throw"],
      [unserializable, "call_cycle"],
    ] as const) {
      const result = await dispatcher.execute({
        callId,
        name: "lookup_ticket",
        arguments: { ticketId: "T-1" },
      });
      expect(result).toEqual({
        ok: false,
        error: {
          code: "handler_error",
          message: "Tool execution failed safely",
        },
      });
      expect(JSON.stringify(result)).not.toContain("password");
      expect(JSON.stringify(result)).not.toContain("secret");
    }
  });
});
