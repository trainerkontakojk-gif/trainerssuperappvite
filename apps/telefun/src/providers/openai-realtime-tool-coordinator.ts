import {
  serializeRealtimeToolResult,
  type RealtimeToolDispatcher,
  type RealtimeToolExecutionResult,
} from "../tools/RealtimeToolDispatcher.js";
import type {
  OpenAIRealtimeResponseDone,
  OpenAIRealtimeToolEvent,
} from "./openai-realtime-event-observer.js";

export type OpenAIRealtimeToolCoordinatorDiagnostic =
  | { type: "function_call_event"; eventType: string; callId?: string }
  | { type: "tool_argument_queue_overflow"; pendingCalls: number }
  | {
      type: "tool_call_capacity_exceeded";
      scope: "response" | "session";
      limit: number;
    };

interface PendingToolArguments {
  chunks: string[];
  bytes: number;
  overflow: boolean;
}

interface PendingToolExecution {
  callId: string;
  result: Promise<RealtimeToolExecutionResult>;
}

export interface OpenAIRealtimeToolCoordinatorOptions {
  dispatcher: RealtimeToolDispatcher;
  maxToolArgumentBytes: number;
  maxPendingToolCalls: number;
  maxToolCallsPerResponse: number;
  maxToolCallsPerSession: number;
  onDiagnostic: (diagnostic: OpenAIRealtimeToolCoordinatorDiagnostic) => void;
  onCapacityExceeded: (
    scope: "response" | "session" | "pending",
    limit: number,
  ) => void;
  canSend: () => boolean;
  send: (message: string) => void;
}

export class OpenAIRealtimeToolCoordinator {
  private readonly pendingToolArguments = new Map<string, PendingToolArguments>();
  private readonly completedToolCalls = new Set<string>();
  private readonly pendingToolExecutions = new Map<string, PendingToolExecution[]>();

  constructor(private readonly options: OpenAIRealtimeToolCoordinatorOptions) {}

  getDefinitions() {
    return this.options.dispatcher.getDefinitions();
  }

  handleEvent(event: OpenAIRealtimeToolEvent): void {
    const eventType =
      event.phase === "delta"
        ? "response.function_call_arguments.delta"
        : "response.function_call_arguments.done";
    this.options.onDiagnostic({
      type: "function_call_event",
      eventType,
      callId: event.callId,
    });
    if (event.phase === "delta") {
      this.accumulateArguments(event.callId, event.delta ?? "");
      return;
    }
    this.completeToolCall(event);
  }

  handleResponseDone({ responseId, status }: OpenAIRealtimeResponseDone): boolean {
    const executions = this.pendingToolExecutions.get(responseId) ?? [];
    this.pendingToolExecutions.delete(responseId);
    if (executions.length === 0) return false;
    if (status === "completed") void this.sendToolResults(executions);
    return true;
  }

  private accumulateArguments(callId: string, delta: string): void {
    let pending = this.pendingToolArguments.get(callId);
    if (!pending) {
      if (this.pendingToolArguments.size >= this.options.maxPendingToolCalls) {
        this.options.onDiagnostic({
          type: "tool_argument_queue_overflow",
          pendingCalls: this.pendingToolArguments.size,
        });
        this.options.onCapacityExceeded("pending", this.options.maxPendingToolCalls);
        return;
      }
      pending = { chunks: [], bytes: 0, overflow: false };
    }
    pending.bytes += Buffer.byteLength(delta, "utf8");
    if (pending.bytes > this.options.maxToolArgumentBytes) {
      pending.overflow = true;
      pending.chunks = [];
    } else if (!pending.overflow) {
      pending.chunks.push(delta);
    }
    this.pendingToolArguments.set(callId, pending);
  }

  private completeToolCall(event: OpenAIRealtimeToolEvent): void {
    const responseId = event.responseId;
    if (!responseId || !event.name) return;
    if (this.completedToolCalls.has(event.callId)) return;

    const executions = this.pendingToolExecutions.get(responseId) ?? [];
    if (this.completedToolCalls.size >= this.options.maxToolCallsPerSession) {
      this.failCapacity("session", this.options.maxToolCallsPerSession);
      return;
    }
    if (executions.length >= this.options.maxToolCallsPerResponse) {
      this.failCapacity("response", this.options.maxToolCallsPerResponse);
      return;
    }
    this.completedToolCalls.add(event.callId);

    const pending = this.pendingToolArguments.get(event.callId);
    this.pendingToolArguments.delete(event.callId);
    const finalArgumentsTooLarge =
      event.arguments !== undefined &&
      Buffer.byteLength(event.arguments, "utf8") > this.options.maxToolArgumentBytes;
    const result =
      pending?.overflow || finalArgumentsTooLarge
        ? Promise.resolve<RealtimeToolExecutionResult>({
            ok: false,
            error: {
              code: "invalid_arguments",
              message: "Tool arguments exceeded the safe size limit",
            },
          })
        : this.options.dispatcher.execute({
            callId: event.callId,
            name: event.name,
            arguments: event.arguments ?? pending?.chunks.join("") ?? "",
          });
    executions.push({ callId: event.callId, result });
    this.pendingToolExecutions.set(responseId, executions);
  }

  private failCapacity(scope: "response" | "session", limit: number): void {
    this.options.onDiagnostic({
      type: "tool_call_capacity_exceeded",
      scope,
      limit,
    });
    this.options.onCapacityExceeded(scope, limit);
  }

  private async sendToolResults(executions: PendingToolExecution[]): Promise<void> {
    const results = await Promise.all(
      executions.map(async ({ callId, result }) => ({ callId, result: await result })),
    );
    if (!this.options.canSend()) return;
    for (const { callId, result } of results) {
      this.options.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: serializeRealtimeToolResult(result),
          },
        }),
      );
    }
    this.options.send(JSON.stringify({ type: "response.create" }));
  }
}
