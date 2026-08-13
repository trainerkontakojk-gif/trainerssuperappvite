import type { SessionMetrics } from "@trainers/types";
import type { OpenAIWebRtcDependencies } from "./contracts";
import {
  OpenAIWebRtcRecordingGraph,
  type OpenAIWebRtcRecordingResult,
} from "./recording";

const RECORDING_CALLBACK_TIMEOUT_MS = 10_000;

type RecordingFinalizerInput = {
  graph: OpenAIWebRtcRecordingGraph | null;
  deps: OpenAIWebRtcDependencies;
  buildMetrics: (volumeSamples: number[]) => SessionMetrics;
  onError: (error: Error) => void;
};

function isObjectUrlRetained(
  deps: OpenAIWebRtcDependencies,
  url: string | null,
): boolean {
  if (!url) return false;
  try {
    return deps.isObjectUrlRetained?.(url) === true;
  } catch {
    return false;
  }
}

function reconcileObjectUrl(params: {
  deps: OpenAIWebRtcDependencies;
  graph: OpenAIWebRtcRecordingGraph | null;
  url: string | null;
  callbackResult: { retainObjectUrl?: boolean } | void;
}): void {
  const retainedByOwner =
    params.callbackResult?.retainObjectUrl === true &&
    isObjectUrlRetained(params.deps, params.url);
  if (!retainedByOwner) params.graph?.revokeObjectUrl(params.url);
}

/** Completes recording and transfers/revokes its object URL exactly once. */
export async function finalizeOpenAIWebRtcRecording({
  graph,
  deps,
  buildMetrics,
  onError,
}: RecordingFinalizerInput): Promise<void> {
  let result: OpenAIWebRtcRecordingResult;
  try {
    result = graph
      ? await graph.stop()
      : { fullBlob: null, agentBlob: null, recordingError: null };
  } catch (error) {
    result = {
      fullBlob: null,
      agentBlob: null,
      recordingError:
        error instanceof Error
          ? error
          : new Error("WebRTC recording stop failed."),
    };
  }
  const url = graph?.createFullObjectUrl(result.fullBlob) ?? null;
  const metrics = buildMetrics(graph?.getVolumeSamples() ?? []);
  let callbackResult: { retainObjectUrl?: boolean } | void = undefined;
  let callbackTimedOut = false;
  let callbackTimedOutWithPageOwner = false;

  if (deps.onRecordingComplete) {
    const timeoutMarker = Symbol("recording-callback-timeout");
    const callbackPromise = Promise.resolve().then(() =>
      deps.onRecordingComplete!(
        url,
        result.fullBlob,
        result.agentBlob,
        metrics,
        graph && !result.recordingError ? "ready" : "failed",
      ),
    );
    // A callback may finish after the bounded lifecycle wait and publish a
    // fallback owner. Keep the URL alive until that callback settles; this
    // continuation performs the eventual single ownership decision.
    void callbackPromise.then(
      (lateResult) => {
        if (!callbackTimedOut) return;
        if (callbackTimedOutWithPageOwner && !isObjectUrlRetained(deps, url)) {
          return;
        }
        reconcileObjectUrl({ deps, graph, url, callbackResult: lateResult });
      },
      () => {
        if (!callbackTimedOut) return;
        onError(new Error("WebRTC recording callback failed."));
        if (callbackTimedOutWithPageOwner && !isObjectUrlRetained(deps, url)) {
          return;
        }
        reconcileObjectUrl({ deps, graph, url, callbackResult: undefined });
      },
    );

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      callbackResult = await Promise.race([
        callbackPromise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(timeoutMarker),
            RECORDING_CALLBACK_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      if (error === timeoutMarker) {
        callbackTimedOut = true;
        callbackTimedOutWithPageOwner = isObjectUrlRetained(deps, url);
        onError(new Error("WebRTC recording callback timed out."));
      } else {
        callbackResult = { retainObjectUrl: true };
        onError(
          error instanceof Error
            ? error
            : new Error("WebRTC recording callback failed."),
        );
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    if (callbackTimedOut) return;
  }

  reconcileObjectUrl({ deps, graph, url, callbackResult });
}
