import type { TelefunTranscriptEntry } from "@trainers/types";
import {
  createOpenAIUsageAccumulator,
  type OpenAIUsageAggregate,
} from "../usage.js";
import { TranscriptCollector } from "../transcript.js";
import type { TelefunWebRtcModelId } from "./contracts.js";
import {
  WebRtcDurabilityError,
  type AttemptOutcome,
  type TelefunWebRtcDb,
  type WebRtcAttemptClaim,
} from "../db.js";
import type {
  DistributedWebRtcLeaseCoordinator,
  DistributedWebRtcLeaseHandle,
} from "./distributed-lease.js";
import type { OpenAiCallsClient } from "./openai-calls-client.js";
import type { WebRtcMetricInput } from "./observability.js";
import type {
  SidebandDiagnostic,
  SidebandEventObserver,
} from "./sideband-event-observer.js";
import type { SidebandClient } from "./sideband-client.js";

export interface WebRtcCallBinding {
  attemptId: string;
  userId: string;
  sessionId: string;
  /** The raw provider ID is retained only while this in-process binding lives. */
  callId: string;
  state: "claimed" | "brokered" | "sideband_connected" | "ending" | "ended";
}

export class WebRtcCallConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("active call exists: WebRTC attempt already exists or was rejected");
    this.name = "WebRtcCallConflictError";
  }
}

export class WebRtcCallQuotaError extends Error {
  readonly status = 429;

  constructor() {
    super("active WebRTC session quota reached");
    this.name = "WebRtcCallQuotaError";
  }
}

export class WebRtcRateLimitError extends Error {
  readonly status = 429;
  readonly resetAt: string;

  constructor(resetAt: string) {
    super("WebRTC request rate limit reached");
    this.name = "WebRtcRateLimitError";
    this.resetAt = resetAt;
  }
}

export class WebRtcShutdownError extends WebRtcDurabilityError {
  readonly status = 503;
  readonly pendingBindingCount: number;

  constructor(pendingBindingCount: number) {
    super("shutdown");
    this.name = "WebRtcShutdownError";
    this.message = "WebRTC graceful shutdown incomplete";
    this.pendingBindingCount = Math.max(0, Math.floor(pendingBindingCount));
  }
}

export interface WebRtcCallManagerOptions {
  callsClient: OpenAiCallsClient;
  createSideband: (
    callId: string,
    callbacks: {
      onEvent: (event: unknown) => void;
      onDiagnostic: (diagnostic: SidebandDiagnostic) => void;
      onClose: (unexpected: boolean) => void;
    },
  ) => SidebandClient;
  /** Durable Phase 4 authority. The legacy callback is test/compatibility only. */
  db?: TelefunWebRtcDb;
  updateSession?: (
    sessionId: string,
    userId: string,
    updates: {
      status: "completed" | "failed";
      duration_seconds: number;
      messages: TelefunTranscriptEntry[];
    },
  ) => Promise<void>;
  flushUsage?: (input: {
    attemptId: string;
    usageRequestId: string;
    userId: string;
    sessionId: string;
    modelId: TelefunWebRtcModelId;
    aggregate: OpenAIUsageAggregate;
    durationMs: number;
  }) => Promise<boolean>;
  sidebandMaxDedupeEntries?: number;
  onSidebandDiagnostic?: (diagnostic: SidebandDiagnostic) => void;
  auditFailedUsage?: (input: {
    attemptId: string;
    usageRequestId: string;
    userId: string;
    sessionId: string;
    modelId: TelefunWebRtcModelId;
    errorMessage: string;
  }) => Promise<boolean>;
  createAttemptId?: () => string;
  lease?: DistributedWebRtcLeaseCoordinator;
  leaseTtlMs?: number;
  maxUserSessions?: number;
  maxProviderSessions?: number;
  rateLimitPerMinute?: number;
  onMetric?: (metric: WebRtcMetricInput) => void;
  encryptProviderCallReference?: (callId: string) => string;
  now?: () => number;
  sidebandDrainTimeoutMs?: number;
  providerHangupTimeoutMs?: number;
  persistenceTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}

export interface WebRtcCallManager {
  startCall(input: {
    userId: string;
    sessionId: string;
    offerSdp: string;
    modelId: TelefunWebRtcModelId;
    livePromptInstructions?: string | null;
    consumerGender?: string | null;
    signal?: AbortSignal;
  }): Promise<{ answerSdp: string }>;
  endCall(
    sessionId: string,
    userId?: string,
    outcome?: AttemptOutcome,
  ): Promise<void>;
  failCall(
    sessionId: string,
    userId?: string,
    outcome?: AttemptOutcome,
  ): Promise<void>;
  /** Drain and finalize in-process WebRTC bindings before server shutdown. */
  shutdown(): Promise<void>;
}

export interface ActiveBinding extends WebRtcCallBinding {
  modelId: TelefunWebRtcModelId;
  startedAtMs: number;
  transcript: TranscriptCollector;
  usage: ReturnType<typeof createOpenAIUsageAccumulator>;
  observer: SidebandEventObserver | null;
  sideband: SidebandClient | null;
  finalization: Promise<void> | null;
  terminalStatus: AttemptOutcome | null;
  startController: AbortController;
  claim: WebRtcAttemptClaim | null;
  claimPromise: Promise<WebRtcAttemptClaim>;
  leasePromise: Promise<DistributedWebRtcLeaseHandle | null>;
  lease: DistributedWebRtcLeaseHandle | null;
  providerBound: boolean;
  providerClosed: boolean;
  /** Recovered attempts have no raw provider ID in Phase 4 and must fail closed. */
  providerRecoveryRequired: boolean;
  startInFlight: boolean;
  sessionPersisted: boolean;
  usagePersisted: boolean;
  checkpointSequence: number;
  checkpointPromise: Promise<void> | null;
  sidebandConnectPromise: Promise<void> | null;
  sidebandAdmissionSealed: boolean;
  sidebandClosed: boolean;
}

export function createActiveBinding(input: {
  userId: string;
  sessionId: string;
  attemptId: string;
  modelId: TelefunWebRtcModelId;
  claimPromise: Promise<WebRtcAttemptClaim>;
  leasePromise: Promise<DistributedWebRtcLeaseHandle | null>;
  now: () => number;
}): ActiveBinding {
  const binding: ActiveBinding = {
    attemptId: input.attemptId,
    userId: input.userId,
    sessionId: input.sessionId,
    modelId: input.modelId,
    callId: "",
    state: "claimed",
    startedAtMs: input.now(),
    transcript: new TranscriptCollector(input.now()),
    usage: createOpenAIUsageAccumulator(),
    observer: null,
    sideband: null,
    finalization: null,
    terminalStatus: null,
    startController: new AbortController(),
    claim: null,
    claimPromise: input.claimPromise,
    leasePromise: input.leasePromise,
    lease: null,
    providerBound: false,
    providerClosed: false,
    providerRecoveryRequired: false,
    startInFlight: true,
    sessionPersisted: false,
    usagePersisted: false,
    checkpointSequence: 0,
    checkpointPromise: null,
    sidebandConnectPromise: null,
    sidebandAdmissionSealed: false,
    sidebandClosed: false,
  };
  void input.claimPromise
    .then((claim) => {
      binding.claim = claim;
      binding.attemptId = claim.attemptId;
      if (binding.state === "claimed") binding.state = claim.state;
    })
    .catch(() => undefined);
  void input.leasePromise
    .then((lease) => {
      binding.lease = lease;
    })
    .catch(() => undefined);
  return binding;
}
