import { supabase } from "../../lib/supabase";
import { telefunClient, unwrapResponse } from "../../lib/api";
import { buildTelefunRecordingPath } from "./recordingPath";
import { remuxRecording } from "./services/telefun-recording-remux-service";
import type { RemuxRecordingResult } from "./services/telefun-recording-remux-service";
import type { CallRecord } from "./types";
import type { TelefunAppSettings } from "./telefunSettings";
import type {
  SessionMetrics,
  TelefunScoreResult,
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
  }) => Promise<void>;
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
    await unwrapResponse(
      await telefunClient["finalize-recording"].$post({ json: params }),
    );
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
  scoringStatus: TelefunScoringStatus;
  remuxed: boolean;
}

const createFinalizerStatus = (): FinalizerStatus => ({
  uploadFailed: false,
  saveFailed: false,
  scoringStatus: "skipped",
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

export async function finalizeTelefunSession(params: {
  sessionId: string;
  fullBlob: Blob | null;
  agentBlob: Blob | null;
  duration: number;
  metrics: SessionMetrics;
  localUrl: string | null;
  sessionConfig: TelefunAppSettings | null;
  scenarioTitle: string;
  consumerName: string;
  dependencies?: Partial<FinalizerDependencies>;
}): Promise<{
  record: CallRecord;
  scoringStatus: TelefunScoringStatus;
  saveFailed: boolean;
  uploadFailed: boolean;
  remuxed: boolean;
}> {
  const deps = { ...defaultDependencies, ...params.dependencies };
  const status = createFinalizerStatus();

  let userId: string | undefined;
  try {
    userId = await deps.getUserId();
  } catch (err) {
    console.error("Failed to get user ID:", err);
  }

  let recordingPath: string | undefined;
  let agentRecordingPath: string | undefined;

  if (userId) {
    if (params.fullBlob) {
      try {
        const path = buildTelefunRecordingPath({
          userId,
          sessionId: params.sessionId,
          type: "full_call",
        });
        recordingPath = await deps.uploadRecording({
          path,
          blob: params.fullBlob,
          type: "full_call",
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
        agentRecordingPath = await deps.uploadRecording({
          path,
          blob: params.agentBlob,
          type: "agent_only",
        });
        if (!agentRecordingPath) {
          markUploadFailed(status);
        }
      } catch (err) {
        console.error("Agent recording upload failed:", err);
        markUploadFailed(status);
      }
    }
  } else {
    if (params.fullBlob || params.agentBlob) {
      markUploadFailed(status);
    }
  }

  // 4. Patch session status, duration, metrics (without score/feedback)
  try {
    await deps.patchSession(params.sessionId, {
      status: "completed",
      duration_seconds: params.duration,
      session_metrics: params.metrics,
    });
  } catch (err) {
    console.error("Base session patch failed:", err);
    markSaveFailed(status);
  }

  // 5. Finalize recording paths in DB
  if (recordingPath || agentRecordingPath) {
    try {
      await deps.finalizeRecording({
        sessionId: params.sessionId,
        recordingPath,
        agentRecordingPath,
      });
    } catch (err) {
      console.error("Finalize recording paths failed:", err);
    }
  }

  // 6. Remux recordings BEFORE scoring (wait for remux to complete)
  if (recordingPath || agentRecordingPath) {
    try {
      const remuxResult = await deps.remuxRecording(params.sessionId);
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
    } catch (err) {
      console.warn("[Telefun] Remux failed before scoring:", err);
    }
  }

  // 7. Score session (only if agent recording existed)
  let score: number | undefined;
  let feedback = "";
  let voiceAssessment: VoiceQualityAssessment | undefined;
  if (agentRecordingPath) {
    try {
      const scoring = await deps.scoreSession(params.sessionId);
      score = scoring.score;
      feedback = scoring.feedback;
      voiceAssessment = scoring.assessment;
      status.scoringStatus = "succeeded";
    } catch (err) {
      console.error("Scoring failed:", err);
      status.scoringStatus = "failed";
    }
  }

  // 8. Patch score and feedback if scoring succeeded
  if (status.scoringStatus === "succeeded" && score !== undefined) {
    try {
      await deps.patchSession(params.sessionId, {
        score,
        feedback,
      });
    } catch (err) {
      console.error("Failed to patch score and feedback:", err);
    }
  }

  // If remux succeeded, use signed URL (empty string — ReviewModal will fetch via API).
  // If remux failed or wasn't attempted, fall back to blob URL.
  const playbackUrl = status.remuxed ? "" : params.localUrl || "";

  const record: CallRecord = {
    id: params.sessionId,
    date: new Date().toISOString(),
    url: playbackUrl,
    consumerName: params.sessionConfig?.consumerName || params.consumerName,
    scenarioTitle:
      params.sessionConfig?.scenarioTitle || params.scenarioTitle || "Custom",
    duration: params.duration,
    recordingPath,
    agentRecordingPath,
    score: score ?? 0,
    feedback,
    voiceAssessment,
    sessionMetrics: params.metrics,
    responsePacingMode: params.sessionConfig?.responsePacingMode,
    telefunModelId: params.sessionConfig?.telefunModelId,
    telefunTransport: params.sessionConfig?.telefunTransport,
    configuredDuration: params.sessionConfig?.maxCallDuration
      ? params.sessionConfig.maxCallDuration * 60
      : undefined,
  };

  return {
    record,
    scoringStatus: status.scoringStatus,
    saveFailed: status.saveFailed,
    uploadFailed: status.uploadFailed,
    remuxed: status.remuxed,
  };
}
