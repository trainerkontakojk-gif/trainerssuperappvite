import type {
  OpenAIWebRtcAudioElementLike,
  OpenAIWebRtcDataChannelLike,
  OpenAIWebRtcPeerConnectionLike,
  OpenAIWebRtcStreamLike,
  OpenAIWebRtcTrackLike,
} from "./contracts";

export function revokeObjectUrlOnce(
  url: string | null,
  revoke: (value: string) => void = (value) => URL.revokeObjectURL(value),
): void {
  if (!url) return;
  try {
    revoke(url);
  } catch {
    /* best-effort ownership cleanup */
  }
}

export interface RetainedObjectUrlOwner {
  retain(url: string | null): boolean;
  isRetained(url: string): boolean;
  transferToReview(url: string): boolean;
  releaseIfNotTransferredToReview(): void;
  returnToSession(url: string | null): void;
  release(): void;
}

export function createRetainedObjectUrlOwner(
  revoke: (value: string) => void = (value) => URL.revokeObjectURL(value),
): RetainedObjectUrlOwner {
  let currentUrl: string | null = null;
  let transferredToReview = false;
  const retiredUrls = new Set<string>();

  const release = () => {
    const url = currentUrl;
    currentUrl = null;
    transferredToReview = false;
    if (!url) return;
    retiredUrls.add(url);
    revokeObjectUrlOnce(url, revoke);
  };

  return {
    retain(url) {
      if (!url || retiredUrls.has(url)) return false;
      if (currentUrl === url) return true;
      release();
      currentUrl = url;
      return true;
    },
    isRetained: (url) => currentUrl === url,
    transferToReview(url) {
      if (currentUrl !== url || retiredUrls.has(url)) return false;
      transferredToReview = true;
      return true;
    },
    releaseIfNotTransferredToReview() {
      if (!transferredToReview) release();
    },
    returnToSession(url) {
      if (!url) return;
      retiredUrls.add(url);
      if (currentUrl === url) {
        currentUrl = null;
        transferredToReview = false;
      }
    },
    release,
  };
}

export function stopTracksOnce(tracks: Iterable<OpenAIWebRtcTrackLike>): void {
  for (const track of tracks) {
    try {
      track.stop();
    } catch {
      /* best-effort */
    }
  }
}

export function clearAudioElement(
  audioElement: OpenAIWebRtcAudioElementLike,
): void {
  audioElement.srcObject = null;
}

export function closeDataChannelOnce(
  channel: OpenAIWebRtcDataChannelLike | null,
): void {
  if (!channel || channel.readyState === "closed") {
    return;
  }

  try {
    channel.close();
  } catch {
    /* best-effort */
  }
}

export function closePeerConnectionOnce(
  peer: OpenAIWebRtcPeerConnectionLike | null,
): void {
  if (!peer) return;

  try {
    peer.close();
  } catch {
    /* best-effort */
  }
}

export function getTracksFromStream(stream: OpenAIWebRtcStreamLike | null) {
  return stream ? stream.getTracks() : [];
}

export function createOpenAIWebRtcRemoteStream(
  tracks: OpenAIWebRtcTrackLike[],
  factory?: (tracks: OpenAIWebRtcTrackLike[]) => OpenAIWebRtcStreamLike,
): OpenAIWebRtcStreamLike {
  if (factory) return factory(tracks);
  if (typeof MediaStream === "undefined") {
    throw new Error("Browser MediaStream is unavailable.");
  }
  return new MediaStream(
    tracks as unknown as MediaStreamTrack[],
  ) as unknown as OpenAIWebRtcStreamLike;
}
