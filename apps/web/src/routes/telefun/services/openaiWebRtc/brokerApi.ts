import {
  OPENAI_WEBRTC_PATH_PREFIX,
  OPENAI_WEBRTC_MAX_SDP_CHARS,
  isUuid,
  type OpenAIWebRtcCallOutcome,
} from "./contracts";

function normalizeBrokerBaseUrl(rawBaseUrl: string): URL {
  const baseUrl = new URL(rawBaseUrl);
  if (!/^https?:$/.test(baseUrl.protocol)) {
    throw new Error("Broker base URL must use http or https.");
  }

  if (baseUrl.username || baseUrl.password) {
    throw new Error("Broker base URL must not contain credentials.");
  }

  const hostname = baseUrl.hostname.toLowerCase();
  if (hostname === "api.openai.com" || hostname.endsWith(".openai.com")) {
    throw new Error("Broker base URL must not point to OpenAI.");
  }

  baseUrl.hash = "";
  baseUrl.search = "";
  return baseUrl;
}

export function buildOpenAIWebRtcBrokerCallUrl(
  brokerHttpBaseUrl: string,
  sessionId: string,
): URL {
  if (!isUuid(sessionId)) {
    throw new Error("Session ID must be a UUID.");
  }

  const baseUrl = normalizeBrokerBaseUrl(brokerHttpBaseUrl);
  const basePath = baseUrl.pathname.replace(/\/+$/, "");
  baseUrl.pathname = `${basePath}${OPENAI_WEBRTC_PATH_PREFIX}/${encodeURIComponent(sessionId)}/call`;
  return baseUrl;
}

function assertAnswerSdp(answerSdp: string): string {
  const trimmed = answerSdp.trim();
  if (!trimmed.startsWith("v=0")) {
    throw new Error("Broker answer must be SDP.");
  }
  if (trimmed.length > OPENAI_WEBRTC_MAX_SDP_CHARS) {
    throw new Error("Broker answer is too large.");
  }
  return trimmed;
}

export async function createOpenAIWebRtcBrokerCall(input: {
  fetch: typeof fetch;
  brokerHttpBaseUrl: string;
  sessionId: string;
  accessToken: string;
  offerSdp: string;
  signal?: AbortSignal;
  onBrokerRequestStarted?: () => void;
  onBrokerResponse?: () => void;
}): Promise<{ answerSdp: string }> {
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new Error("Access token is required.");
  }

  const offerSdp = input.offerSdp;
  if (!offerSdp.trim()) {
    throw new Error("Offer SDP is required.");
  }

  if (offerSdp.length > OPENAI_WEBRTC_MAX_SDP_CHARS) {
    throw new Error("Offer SDP is too large.");
  }

  const url = buildOpenAIWebRtcBrokerCallUrl(
    input.brokerHttpBaseUrl,
    input.sessionId,
  );

  input.onBrokerRequestStarted?.();
  const response = await input.fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/sdp",
    },
    body: offerSdp,
    signal: input.signal,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    throw new Error("OpenAI WebRTC broker request failed.");
  }
  input.onBrokerResponse?.();
  if (!contentType.toLowerCase().includes("application/sdp")) {
    throw new Error("Broker answer must be application/sdp.");
  }

  return { answerSdp: assertAnswerSdp(await response.text()) };
}

export async function deleteOpenAIWebRtcBrokerCall(input: {
  fetch: typeof fetch;
  brokerHttpBaseUrl: string;
  sessionId: string;
  accessToken: string;
  outcome?: OpenAIWebRtcCallOutcome;
  signal?: AbortSignal;
}): Promise<void> {
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new Error("Access token is required.");
  }

  if (
    input.outcome !== undefined &&
    !["failed", "network_lost", "orphaned"].includes(input.outcome)
  ) {
    throw new Error("Invalid broker call outcome.");
  }

  const url = buildOpenAIWebRtcBrokerCallUrl(
    input.brokerHttpBaseUrl,
    input.sessionId,
  );
  if (input.outcome !== undefined) {
    url.searchParams.set("outcome", input.outcome);
  }

  const response = await input.fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: input.signal,
  });

  if (response.status !== 204) {
    throw new Error("OpenAI WebRTC broker delete failed.");
  }
}
