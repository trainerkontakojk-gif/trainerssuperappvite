import type { OpenAIWebRtcCallOutcome } from "./contracts";
import { deleteOpenAIWebRtcBrokerCall } from "./brokerApi";

export async function deleteOpenAIWebRtcBrokerCallWithTimeout(input: {
  fetch: typeof fetch;
  brokerHttpBaseUrl: string;
  sessionId: string;
  accessToken: string;
  outcome?: OpenAIWebRtcCallOutcome;
  timeoutMs: number;
}): Promise<void> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error("OpenAI WebRTC cleanup timed out."));
    }, input.timeoutMs);
  });

  try {
    await Promise.race([
      deleteOpenAIWebRtcBrokerCall({ ...input, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
