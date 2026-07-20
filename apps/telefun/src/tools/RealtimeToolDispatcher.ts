import type { z } from "zod";

const DEFAULT_MAX_ARGUMENT_BYTES = 64 * 1024;
const DEFAULT_MAX_CALLS = 256;
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface RealtimeToolDefinition<TArguments = unknown> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodType<TArguments>;
  handler(arguments_: TArguments): Promise<unknown> | unknown;
}

export interface RealtimeToolAdvertisement {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RealtimeToolCall {
  callId: string;
  name: string;
  arguments: unknown;
}

export type RealtimeToolErrorCode =
  | "invalid_call"
  | "unknown_tool"
  | "invalid_arguments"
  | "handler_error"
  | "capacity_exceeded";

export type RealtimeToolExecutionResult =
  | { ok: true; output: unknown }
  | {
      ok: false;
      error: {
        code: RealtimeToolErrorCode;
        message: string;
      };
    };

export interface RealtimeToolDispatcherOptions {
  maxArgumentBytes?: number;
  maxCalls?: number;
}

type AnyRealtimeToolDefinition = RealtimeToolDefinition<any>;

export class RealtimeToolDispatcher {
  private readonly definitions = new Map<string, AnyRealtimeToolDefinition>();
  private readonly executions = new Map<
    string,
    Promise<RealtimeToolExecutionResult>
  >();
  private readonly maxArgumentBytes: number;
  private readonly maxCalls: number;

  constructor(
    definitions: ReadonlyArray<AnyRealtimeToolDefinition>,
    options: RealtimeToolDispatcherOptions = {},
  ) {
    this.maxArgumentBytes =
      options.maxArgumentBytes ?? DEFAULT_MAX_ARGUMENT_BYTES;
    this.maxCalls = options.maxCalls ?? DEFAULT_MAX_CALLS;

    for (const definition of definitions) {
      if (
        !TOOL_NAME_PATTERN.test(definition.name) ||
        definition.description.trim().length === 0 ||
        definition.description.length > 1_024 ||
        !isRecord(definition.parameters)
      ) {
        throw new Error("Invalid Telefun tool definition");
      }
      if (this.definitions.has(definition.name)) {
        throw new Error(
          `Duplicate Telefun tool definition: ${definition.name}`,
        );
      }
      this.definitions.set(definition.name, definition);
    }
  }

  getDefinitions(): RealtimeToolAdvertisement[] {
    return [...this.definitions.values()].map((definition) => ({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
    }));
  }

  execute(call: RealtimeToolCall): Promise<RealtimeToolExecutionResult> {
    if (!isSafeIdentifier(call.callId) || !isSafeIdentifier(call.name)) {
      return Promise.resolve(
        toolError("invalid_call", "Tool call identity is invalid"),
      );
    }

    const existing = this.executions.get(call.callId);
    if (existing) return existing;
    if (this.executions.size >= this.maxCalls) {
      return Promise.resolve(
        toolError(
          "capacity_exceeded",
          "Telefun tool-call capacity was reached",
        ),
      );
    }

    const execution = this.executeOnce(call);
    this.executions.set(call.callId, execution);
    return execution;
  }

  private async executeOnce(
    call: RealtimeToolCall,
  ): Promise<RealtimeToolExecutionResult> {
    const definition = this.definitions.get(call.name);
    if (!definition) {
      return toolError(
        "unknown_tool",
        "Tool is not available in this Telefun session",
      );
    }

    const decoded = decodeArguments(call.arguments, this.maxArgumentBytes);
    if (!decoded.ok) {
      return toolError("invalid_arguments", decoded.message);
    }

    const parsed = definition.schema.safeParse(decoded.value);
    if (!parsed.success) {
      return toolError(
        "invalid_arguments",
        "Tool arguments did not match the approved schema",
      );
    }

    try {
      const output = await definition.handler(parsed.data);
      const serialized = JSON.stringify(output ?? null);
      if (serialized === undefined) throw new Error("not serializable");
      return { ok: true, output: JSON.parse(serialized) as unknown };
    } catch {
      return toolError("handler_error", "Tool execution failed safely");
    }
  }
}

export function createProductionRealtimeToolDispatcher(): RealtimeToolDispatcher {
  return new RealtimeToolDispatcher([]);
}

export function serializeRealtimeToolResult(
  result: RealtimeToolExecutionResult,
): string {
  return JSON.stringify(result);
}

function decodeArguments(
  value: unknown,
  maxBytes: number,
): { ok: true; value: unknown } | { ok: false; message: string } {
  let serialized: string;
  try {
    serialized = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return {
      ok: false,
      message: "Tool arguments did not match the approved schema",
    };
  }

  if (
    typeof serialized !== "string" ||
    Buffer.byteLength(serialized, "utf8") > maxBytes
  ) {
    return {
      ok: false,
      message: "Tool arguments exceeded the safe size limit",
    };
  }

  if (typeof value !== "string") return { ok: true, value };
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return {
      ok: false,
      message: "Tool arguments did not match the approved schema",
    };
  }
}

function toolError(
  code: RealtimeToolErrorCode,
  message: string,
): RealtimeToolExecutionResult {
  return { ok: false, error: { code, message } };
}

function isSafeIdentifier(value: string): boolean {
  return TOOL_NAME_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
