export type WebRtcCleanupOwner = {
  sessionId: string;
  accessToken: string;
  state: "pending" | "confirmed" | "retryable";
  request: () => Promise<void>;
  inFlight: Promise<void> | null;
};

export function createWebRtcCleanupOwner(input: {
  sessionId: string;
  accessToken: string;
  requestCleanup: () => Promise<void>;
}): WebRtcCleanupOwner {
  const owner: WebRtcCleanupOwner = {
    sessionId: input.sessionId,
    accessToken: input.accessToken,
    state: "pending",
    request: undefined as unknown as () => Promise<void>,
    inFlight: null,
  };

  owner.request = () => {
    if (owner.state === "confirmed") return Promise.resolve();
    if (owner.inFlight) return owner.inFlight;

    let request: Promise<void>;
    try {
      request = Promise.resolve(input.requestCleanup());
    } catch (error) {
      request = Promise.reject(error);
    }
    request = request.then(
      () => {
        owner.state = "confirmed";
      },
      (error: unknown) => {
        owner.state = "retryable";
        throw error;
      },
    );
    const trackedRequest = request.finally(() => {
      if (owner.inFlight === trackedRequest) owner.inFlight = null;
    });
    owner.inFlight = trackedRequest;
    return trackedRequest;
  };

  return owner;
}
