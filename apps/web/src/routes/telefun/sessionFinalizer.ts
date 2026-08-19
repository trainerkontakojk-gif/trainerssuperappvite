import { supabase } from "../../lib/supabase";
import { telefunClient, unwrapResponse } from "../../lib/api";
import { buildTelefunRecordingPath } from "./recordingPath";
import { remuxRecording } from "./services/telefun-recording-remux-service";
import type { RemuxRecordingResult } from "./services/telefun-recording-remux-service";
import {
  createRecordingReconciliation,
  type RecordingReconciliationApi,
} from "./services/telefun-recording-reconciliation";
import type { CallRecord } from "./types";
import type { TelefunAppSettings } from "./telefunSettings";
import type {
  SessionMetrics,
  TelefunScoreResult,
  TelefunTransport,
  VoiceQualityAssessment,
} from "@trainers/types";
import { parseTelefunScoreResult } from "@trainers/types";

interface TelefunSessionPatch {
  status?: "completed";
  duration_seconds?: number;
  session_metrics?: SessionMetrics;
  score?: number;
  feedback?: string;
}

export interface TelefunRecordingTransitionResult {
  recordingStatus?: "uploaded" | "partial" | "ready" | "failed";
  recordingReady?: boolean;
  scoringReady?: boolean;
  scoringStatus?: "pending" | "processing" | "completed" | "failed";
}

export interface FinalizerDependencies {
  getUserId: () => Promise<string | undefined>;
  uploadRecording: (params: {
    path: string;
    blob: Blob;
    type: "full_call" | "agent_only";
  }) => Promise<string | undefined>;
  patchSession: (sessionId: string, body: TelefunSessionPatch) => Promise<void>;
  finalizeRecording: (params: {
    sessionId: string;
    recordingPath?: string;
    agentRecordingPath?: string;
    captureStatus?: "ready" | "failed";
  }) => Promise<TelefunRecordingTransitionResult | void>;
  remuxRecording: (sessionId: string) => Promise<{
    success: boolean;
    data?: RemuxRecordingResult;
    error?: string;
  }>;
  scoreSession: (sessionId: string) => Promise<TelefunScoreResult>;
}

const defaultDependencies: FinalizerDependencies = {
  getUserId: async () => {
    const { data } = await supabase.auth.getUser();
    return data.user?.id;
  },
  uploadRecording: async ({ path, blob }) => {
    const { data } = await supabase.storage
      .from("telefun-recordings")
      .upload(path, blob, {
        contentType: "audio/webm",
        upsert: true,
      });
    return data?.path;
  },
  patchSession: async (sessionId, body) => {
    await unwrapResponse(
      await telefunClient.sessions[":sessionId"].$patch({
        param: { sessionId },
        json: body,
      }),
    );
  },
  finalizeRecording: async (params) => {
    return (await unwrapResponse(
      await telefunClient["finalize-recording"].$post({ json: params }),
    )) as TelefunRecordingTransitionResult;
  },
  remuxRecording,
  scoreSession: async (sessionId) => {
    const response = await (unwrapResponse(
      await telefunClient.score[":sessionId"].$post({
        param: { sessionId },
        json: {},
      }),
    ) as any);
    const result = parseTelefunScoreResult(response);
    if (!result) {
      throw new Error("Format hasil penilaian Telefun tidak valid.");
    }
    return result;
  },
};

export type TelefunScoringStatus = "succeeded" | "failed" | "skipped";

interface FinalizerStatus {
  uploadFailed: boolean;
  saveFailed: boolean;
  remuxed: boolean;
}

const createFinalizerStatus = (): FinalizerStatus => ({
  uploadFailed: false,
  saveFailed: false,
  remuxed: false,
});

const markUploadFailed = (status: FinalizerStatus) => {
  status.uploadFailed = true;
};

const markSaveFailed = (status: FinalizerStatus) => {
  status.saveFailed = true;
};

const markRemuxed = (status: FinalizerStatus) => {
  status.remuxed = true;
};

async function retryOnce<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (firstError) {
    try {
      return await operation();
    } catch {
      throw firstError;
    }
  }
}

export interface TelefunSessionFinalizerParams {
  sessionId: string;
  fullBlob: Blob | null;
  agentBlob: Blob | null;
  captureStatus?: "ready" | "failed";
  duration: number;
  metrics: SessionMetrics;
  localUrl: string | null;
  sessionConfig: TelefunAppSettings | null;
  scenarioTitle: string;
  consumerName: string;
  dependencies?: Partial<FinalizerDependencies>;
}

export interface SavedTelefunSession {
  record: CallRecord;
  recordingPath?: string;
  agentRecordingPath?: string;
  saveFailed: boolean;
  uploadFailed: boolean;
  remuxed: boolean;
  recordingStatus?: TelefunRecordingTransitionResult["recordingStatus"];
  recordingReady?: boolean;
  scoringReady?: boolean;
}

export interface TelefunScoringResult {
  scoringStatus: TelefunScoringStatus;
  score?: number;
  feedback: string;
  voiceAssessment?: VoiceQualityAssessment;
}

function buildCallRecord(
  params: TelefunSessionFinalizerParams,
  paths: {
    recordingPath?: string;
    agentRecordingPath?: string;
  },
  remuxed: boolean,
  scoring: Pick<
    TelefunScoringResult,
    "score" | "feedback" | "voiceAssessment"
  > = {
    score: undefined,
    feedback: "",
    voiceAssessment: undefined,
  },
  scoringStatus?: TelefunRecordingTransitionResult["scoringStatus"],
): CallRecord {
  // If remux succeeded, use signed URL (empty string — ReviewModal will fetch via API).
  // If remux failed or wasn't attempted, fall back to blob URL.
  const playbackUrl = remuxed ? "" : params.localUrl || "";

  return {
    id: params.sessionId,
    date: new Date().toISOString(),
    url: playbackUrl,
    consumerName: params.sessionConfig?.consumerName || params.consumerName,
    scenarioTitle:
      params.sessionConfig?.scenarioTitle || params.scenarioTitle || "Custom",
    duration: params.duration,
    recordingPath: paths.recordingPath,
    agentRecordingPath: paths.agentRecordingPath,
    // A missing score must stay undefined ("—") — never force it to 0.
    score: scoring.score ?? undefined,
    feedback: scoring.feedback,
    voiceAssessment: scoring.voiceAssessment,
    scoringStatus,
    sessionMetrics: params.metrics,
    responsePacingMode: params.sessionConfig?.responsePacingMode,
    telefunModelId: params.sessionConfig?.telefunModelId,
    telefunTransport: params.sessionConfig?.telefunTransport,
    configuredDuration: params.sessionConfig?.maxCallDuration
      ? params.sessionConfig.maxCallDuration * 60
      : undefined,
  };
}

export async function saveTelefunSession(
  params: TelefunSessionFinalizerParams,
): Promise<SavedTelefunSession> {
  const deps = { ...defaultDependencies, ...params.dependencies };
  const status = createFinalizerStatus();

  let userId: string | undefined;
  try {
    userId = await deps.getUserId();
  } catch (err) {
    console.error("Failed to get user ID:", err);
  }

  const isWebRtcSession =
    params.sessionConfig?.telefunTransport === "openai-webrtc";
  let recordingPath: string | undefined;
  let agentRecordingPath: string | undefined;
  let recordingTransition: TelefunRecordingTransitionResult | undefined;

  if (userId) {
    if (params.fullBlob) {
      try {
        const path = buildTelefunRecordingPath({
          userId,
          sessionId: params.sessionId,
          type: "full_call",
        });
        const fullBlob = params.fullBlob;
        recordingPath = await retryOnce(async () => {
          const uploaded = await deps.uploadRecording({
            path,
            blob: fullBlob,
            type: "full_call",
          });
          if (!uploaded) throw new Error("Full recording upload returned no path.");
          return isWebRtcSession ? path : uploaded;
        });
        if (!recordingPath) {
          markUploadFailed(status);
        }
      } catch (err) {
        console.error("Full recording upload failed:", err);
        markUploadFailed(status);
      }
    }
    if (params.agentBlob) {
      try {
        const path = buildTelefunRecordingPath({
          userId,
          sessionId: params.sessionId,
          type: "agent_only",
        });
        const agentBlob = params.agentBlob;
        agentRecordingPath = await retryOnce(async () => {
          const uploaded = await deps.uploadRecording({
            path,
            blob: agentBlob,
            type: "agent_only",
          });
          if (!uploaded) throw new Error("Agent recording upload returned no path.");
          return isWebRtcSession ? path : uploaded;
        });
        if (!agentRecordingPath) {
          markUploadFailed(status);
        }
      } catch (err) {
        console.error("Agent recording upload failed:", err);
        markUploadFailed(status);
      }
    }
  } else if (params.fullBlob || params.agentBlob) {
    markUploadFailed(status);
  }

  // Legacy sessions still own their completed/status/path patch. WebRTC only
  // patches metrics; the broker/API terminal and recording RPCs own lifecycle
  // fields, paths, and scoring readiness.
  try {
    await deps.patchSession(
      params.sessionId,
      isWebRtcSession
        ? { session_metrics: params.metrics }
        : {
            status: "completed",
            duration_seconds: params.duration,
            session_metrics: params.metrics,
          },
    );
  } catch (err) {
    console.error("Base session patch failed:", err);
    markSaveFailed(status);
  }

  const captureFailed =
    status.uploadFailed ||
    params.captureStatus === "failed" ||
    (!recordingPath && !agentRecordingPath);

  if (isWebRtcSession) {
    if (captureFailed) markSaveFailed(status);
    if (!userId) {
      // A queue entry cannot be owner-scoped without the authenticated UUID.
      // Keep the uploaded objects conservative and report that this save was
      // not durably handed off; no transition request is made without a queue.
      markSaveFailed(status);
    } else {
      const reconciliationApi: RecordingReconciliationApi = {
        getUserId: async () => userId,
        finalizeRecording: async (input) =>
          (await deps.finalizeRecording({
            sessionId: input.sessionId,
            recordingPath: input.recordingPath,
            agentRecordingPath: input.agentRecordingPath,
            captureStatus: input.captureStatus,
          })) ?? {},
        remuxRecording: (sessionId) => deps.remuxRecording(sessionId),
      };
      const reconciliation = createRecordingReconciliation({
        api: reconciliationApi,
      });
      const queued = await reconciliation.enqueue({
        userId,
        sessionId: params.sessionId,
        recordingPath: recordingPath ?? null,
        agentRecordingPath: agentRecordingPath ?? null,
        captureStatus: captureFailed ? "failed" : "ready",
      });

      if (queued.transition) recordingTransition = queued.transition;
      if (queued.remux?.data) {
        recordingTransition = {
          ...recordingTransition,
          recordingStatus:
            queued.remux.data.recordingStatus ?? recordingTransition?.recordingStatus,
          recordingReady:
            queued.remux.data.recordingReady ?? recordingTransition?.recordingReady,
          scoringReady:
            queued.remux.data.scoringReady ?? recordingTransition?.scoringReady,
          scoringStatus:
            queued.remux.data.scoringStatus ?? recordingTransition?.scoringStatus,
        };
      }
      if (queued.removed && queued.remux?.success) {
        markRemuxed(status);
      }
      if (
        !queued.queued ||
        queued.saveFailed ||
        !queued.removed ||
        queued.terminalFailure === true
      ) {
        markSaveFailed(status);
      }
    }
  } else {
    let recordingTransitionPersisted = true;
    if (recordingPath || agentRecordingPath) {
      try {
        const transition = await retryOnce(() =>
          deps.finalizeRecording({
            sessionId: params.sessionId,
            recordingPath,
            agentRecordingPath,
          }),
        );
        if (transition) recordingTransition = transition;
      } catch (err) {
        recordingTransitionPersisted = false;
        console.error("Finalize recording paths failed:", err);
      }
    }

    // Legacy remux retains its existing direct transition and retry behavior.
    if (recordingTransitionPersisted && (recordingPath || agentRecordingPath)) {
      try {
        const firstRemux = await deps.remuxRecording(params.sessionId);
        const remuxResult = firstRemux.success
          ? firstRemux
          : await deps.remuxRecording(params.sessionId);
        const playbackPath = recordingPath || agentRecordingPath;
        const playbackRemuxed = playbackPath
          ? remuxResult.data?.recordings[playbackPath]?.remuxed
          : false;
        if (
          remuxResult.success &&
          (playbackRemuxed || remuxResult.data?.remuxed)
        ) {
          markRemuxed(status);
        } else {
          console.warn(
            "[Telefun] Remux not successful, using original recordings:",
            remuxResult.error,
          );
        }
        if (remuxResult.data) {
          recordingTransition = {
            ...recordingTransition,
            recordingStatus:
              remuxResult.data.recordingStatus ?? recordingTransition?.recordingStatus,
            recordingReady:
              remuxResult.data.recordingReady ?? recordingTransition?.recordingReady,
            scoringReady:
              remuxResult.data.scoringReady ?? recordingTransition?.scoringReady,
            scoringStatus:
              remuxResult.data.scoringStatus ?? recordingTransition?.scoringStatus,
          };
        }
      } catch (err) {
        console.warn("[Telefun] Remux failed before scoring:", err);
      }
    }
  }

  return {
    record: buildCallRecord(
      params,
      { recordingPath, agentRecordingPath },
      status.remuxed,
      undefined,
      recordingTransition?.scoringStatus,
    ),
    recordingPath,
    agentRecordingPath,
    saveFailed: status.saveFailed,
    uploadFailed: status.uploadFailed,
    remuxed: status.remuxed,
    recordingStatus: recordingTransition?.recordingStatus,
    recordingReady: recordingTransition?.recordingReady,
    scoringReady: recordingTransition?.scoringReady,
  };
}

export async function scoreTelefunSession(params: {
  sessionId: string;
  agentRecordingPath?: string;
  transport?: TelefunTransport;
  dependencies?: Partial<FinalizerDependencies>;
}): Promise<TelefunScoringResult> {
  if (params.transport === "openai-webrtc") {
    return {
      scoringStatus: "skipped",
      feedback: "",
    };
  }
  const deps = { ...defaultDependencies, ...params.dependencies };

  if (!params.agentRecordingPath) {
    return {
      scoringStatus: "skipped",
      feedback: "",
    };
  }

  try {
    const scoring = await deps.scoreSession(params.sessionId);
    try {
      await deps.patchSession(params.sessionId, {
        score: scoring.score,
        feedback: scoring.feedback,
      });
    } catch (err) {
      console.error("Failed to patch score and feedback:", err);
    }

    return {
      scoringStatus: "succeeded",
      score: scoring.score,
      feedback: scoring.feedback,
      voiceAssessment: scoring.assessment,
    };
  } catch (err) {
    console.error("Scoring failed:", err);
    return {
      scoringStatus: "failed",
      feedback: "",
    };
  }
}

export async function finalizeTelefunSession(
  params: TelefunSessionFinalizerParams,
): Promise<{
  record: CallRecord;
  scoringStatus: TelefunScoringStatus;
  saveFailed: boolean;
  uploadFailed: boolean;
  remuxed: boolean;
}> {
  const saved = await saveTelefunSession(params);
  const scoring = await scoreTelefunSession({
    sessionId: params.sessionId,
    agentRecordingPath: saved.agentRecordingPath,
    transport: params.sessionConfig?.telefunTransport,
    dependencies: params.dependencies,
  });

  const finalScoringStatus =
    scoring.scoringStatus === "succeeded"
      ? "completed"
      : saved.record.scoringStatus;

  return {
    ...saved,
    record: buildCallRecord(
      params,
      {
        recordingPath: saved.recordingPath,
        agentRecordingPath: saved.agentRecordingPath,
      },
      saved.remuxed,
      scoring,
      finalScoringStatus,
    ),
    scoringStatus: scoring.scoringStatus,
  };
}
