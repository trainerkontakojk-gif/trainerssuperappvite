import type {
  OpenAIWebRtcCallOutcome,
  OpenAIWebRtcDependencies,
  OpenAIWebRtcSessionConfig,
} from "./contracts";
import { deleteOpenAIWebRtcBrokerCallWithTimeout } from "./brokerCleanup";

/**
 * Narrow browser compatibility boundary for an already owner-bound historical
 * call. It has no session creation, media, SDP, or data-plane operation.
 */
export async function cleanupHistoricalOpenAiWebRtcSession(input: {
  fetch: typeof fetch;
  brokerHttpBaseUrl: string;
  sessionId: string;
  accessToken: string;
  outcome?: OpenAIWebRtcCallOutcome;
  timeoutMs?: number;
}): Promise<void> {
  await deleteOpenAIWebRtcBrokerCallWithTimeout({
    fetch: input.fetch,
    brokerHttpBaseUrl: input.brokerHttpBaseUrl,
    sessionId: input.sessionId,
    accessToken: input.accessToken,
    outcome: input.outcome ?? "failed",
    timeoutMs: input.timeoutMs ?? 5_000,
  });
}

/**
 * @deprecated Compatibility shell for old cached modules only. `connect()`
 * cannot create a call and is retained solely so those modules fail closed.
 */
export class OpenAIWebRtcSession {
  constructor(
    private readonly config: OpenAIWebRtcSessionConfig,
    private readonly deps: Pick<OpenAIWebRtcDependencies, "fetch"> &
      Partial<OpenAIWebRtcDependencies>,
  ) {}

  public async connect(): Promise<never> {
    throw new Error(
      "OpenAI WebRTC starts require HTTPS and are permanently disabled for Telefun.",
    );
  }

  public cleanup(
    outcome: OpenAIWebRtcCallOutcome = "failed",
  ): Promise<void> {
    return cleanupHistoricalOpenAiWebRtcSession({
      fetch: this.deps.fetch,
      brokerHttpBaseUrl: this.config.brokerHttpBaseUrl,
      sessionId: this.config.sessionId,
      accessToken: this.config.accessToken,
      outcome,
      timeoutMs: this.config.deleteTimeoutMs,
    });
  }
}
