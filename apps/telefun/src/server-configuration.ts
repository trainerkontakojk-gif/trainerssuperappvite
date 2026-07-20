import { TELEFUN_CONFIGURATION_CLOSE_CODE } from "@trainers/types";
import type { RealtimeProviderAdapter } from "./providers/RealtimeProviderAdapter.js";
import type { RealtimeProviderRouterResult } from "./providers/provider-router.js";
import {
  parseTelefunSessionConfigure,
  type ValidatedTelefunSessionConfigure,
} from "./server-protocol.js";

export const TELEFUN_CONFIGURATION_TIMEOUT_MS = 10_000;
export const TELEFUN_MAX_BROWSER_FRAME_BYTES = 1_048_576;
export const TELEFUN_WEBSOCKET_SERVER_OPTIONS = {
  maxPayload: TELEFUN_MAX_BROWSER_FRAME_BYTES,
} as const;

type ConfigurationGateState =
  | "idle"
  | "waiting"
  | "configuring"
  | "configured"
  | "closed";

export interface TelefunProviderConfigurationGateDependencies {
  createAdapter: (
    configuration: ValidatedTelefunSessionConfigure,
  ) => RealtimeProviderRouterResult;
  onConfigured: (
    configuration: ValidatedTelefunSessionConfigure,
    adapter: RealtimeProviderAdapter,
  ) => void;
  onClose: (code: number, reason: string) => void;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

export class TelefunProviderConfigurationGate {
  private state: ConfigurationGateState = "idle";
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private pendingAdapter: RealtimeProviderAdapter | null = null;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;

  constructor(
    private readonly dependencies: TelefunProviderConfigurationGateDependencies,
  ) {
    this.setTimeoutFn = dependencies.setTimeout ?? setTimeout;
    this.clearTimeoutFn = dependencies.clearTimeout ?? clearTimeout;
  }

  start(): void {
    if (this.state !== "idle") return;
    this.state = "waiting";
    this.timeout = this.setTimeoutFn(() => {
      if (this.state !== "waiting") return;
      this.reject("configuration_timeout");
    }, TELEFUN_CONFIGURATION_TIMEOUT_MS);
  }

  handleMessage(message: unknown): boolean {
    if (this.state === "closed") return true;

    if (this.state === "configured") {
      if (isConfigureEnvelope(message)) {
        this.reject("duplicate_configuration");
        return true;
      }
      return false;
    }

    if (this.state === "configuring") {
      this.reject("duplicate_configuration");
      return true;
    }

    const parsed = parseTelefunSessionConfigure(message);
    if (!parsed.ok) {
      this.reject(parsed.reason);
      return true;
    }

    this.clearConfigurationTimeout();
    this.state = "configuring";
    const routed = this.dependencies.createAdapter(parsed.value);
    if (!routed.ok) {
      this.reject(routed.reason);
      return true;
    }

    this.pendingAdapter = routed.adapter;
    try {
      const connection = routed.adapter.connect();
      if (isPromiseLike(connection)) {
        void connection.then(
          () => this.finishConfiguration(parsed.value, routed.adapter),
          () => this.rejectProviderConnection(),
        );
      } else {
        this.finishConfiguration(parsed.value, routed.adapter);
      }
    } catch {
      this.rejectProviderConnection();
    }
    return true;
  }

  isConfigured(): boolean {
    return this.state === "configured";
  }

  rejectClientMessage(reason: string): void {
    this.reject(reason);
  }

  dispose(): void {
    this.clearConfigurationTimeout();
    this.closePendingAdapter(1000, "Telefun configuration gate disposed");
    this.state = "closed";
  }

  private finishConfiguration(
    configuration: ValidatedTelefunSessionConfigure,
    adapter: RealtimeProviderAdapter,
  ): void {
    if (this.state !== "configuring") return;
    if (this.pendingAdapter !== adapter) return;
    this.pendingAdapter = null;
    this.state = "configured";
    this.dependencies.onConfigured(configuration, adapter);
  }

  private rejectProviderConnection(): void {
    if (this.state === "closed") return;
    this.clearConfigurationTimeout();
    this.closePendingAdapter(1011, "Realtime provider connection failed");
    this.state = "closed";
    this.dependencies.onClose(1011, "Realtime provider connection failed");
  }

  private reject(reason: string): void {
    if (this.state === "closed") return;
    this.clearConfigurationTimeout();
    this.closePendingAdapter(
      TELEFUN_CONFIGURATION_CLOSE_CODE,
      `Telefun configuration rejected: ${reason}`,
    );
    this.state = "closed";
    this.dependencies.onClose(
      TELEFUN_CONFIGURATION_CLOSE_CODE,
      `Telefun configuration rejected: ${reason}`,
    );
  }

  private clearConfigurationTimeout(): void {
    if (!this.timeout) return;
    this.clearTimeoutFn(this.timeout);
    this.timeout = null;
  }

  private closePendingAdapter(code: number, reason: string): void {
    const adapter = this.pendingAdapter;
    this.pendingAdapter = null;
    adapter?.close(code, reason);
  }
}

function isConfigureEnvelope(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).type === "telefun_session_configure",
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return Boolean(
    value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<void>).then === "function",
  );
}
