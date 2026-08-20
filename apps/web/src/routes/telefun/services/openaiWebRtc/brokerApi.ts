import {
  OPENAI_WEBRTC_PATH_PREFIX,
  isUuid,
  type OpenAIWebRtcCallOutcome,
} from "./contracts";

function normalizeBrokerBaseUrl(rawBaseUrl: string): URL {
  const baseUrl = new URL(rawBaseUrl);
  if (!/^https?:$/.test(baseUrl.protocol)) throw new Error("Broker base URL must use http or https.");
  if (baseUrl.username || baseUrl.password) throw new Error("Broker base URL must not contain credentials.");
  if (baseUrl.hostname.toLowerCase() === "api.openai.com" || baseUrl.hostname.toLowerCase().endsWith(".openai.com")) throw new Error("Broker base URL must not point to OpenAI.");
  baseUrl.hash = "";
  baseUrl.search = "";
  return baseUrl;
}

export function buildOpenAIWebRtcBrokerCallUrl(
  brokerHttpBaseUrl: string,
  sessionId: string,
): URL {
  if (!isUuid(sessionId)) throw new Error("Session ID must be a UUID.");
  const baseUrl = normalizeBrokerBaseUrl(brokerHttpBaseUrl);
  const basePath = baseUrl.pathname.replace(/\/+$/, "");
  baseUrl.pathname = `${basePath}${OPENAI_WEBRTC_PATH_PREFIX}/${encodeURIComponent(sessionId)}/call`;
  return baseUrl;
}

/** The retired browser surface intentionally exposes no POST/start helper. */
export async function deleteOpenAIWebRtcBrokerCall(input: {
  fetch: typeof fetch;
  brokerHttpBaseUrl: string;
  sessionId: string;
  accessToken: string;
  outcome?: OpenAIWebRtcCallOutcome;
  signal?: AbortSignal;
}): Promise<void> {
  const accessToken = input.accessToken.trim();
  if (!accessToken) throw new Error("Access token is required.");
  if (input.outcome !== undefined && !["failed", "network_lost", "orphaned"].includes(input.outcome)) throw new Error("Invalid broker call outcome.");
  const url = buildOpenAIWebRtcBrokerCallUrl(input.brokerHttpBaseUrl, input.sessionId);
  if (input.outcome !== undefined) url.searchParams.set("outcome", input.outcome);
  const response = await input.fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: input.signal,
  });
  if (response.status !== 204) throw new Error("OpenAI WebRTC broker delete failed.");
}
