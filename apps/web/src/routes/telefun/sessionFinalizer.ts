import { supabase } from "../../lib/supabase";
import { postApi, patchApi } from "../../hooks/useApi";
import { buildTelefunRecordingPath } from "./recordingPath";
import type { CallRecord } from "./types";
import type { TelefunAppSettings } from "./telefunSettings";

export interface FinalizerDependencies {
  getUserId: () => Promise<string | undefined>;
  uploadRecording: (params: { path: string; blob: Blob; type: "full_call" | "agent_only" }) => Promise<string | undefined>;
  patchSession: (sessionId: string, body: any) => Promise<void>;
  finalizeRecording: (params: { sessionId: string; recordingPath?: string; agentRecordingPath?: string }) => Promise<void>;
  scoreSession: (sessionId: string) => Promise<{ score: number; feedback: string; assessment?: any }>;
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
    await patchApi(`/telefun/sessions/${sessionId}`, body);
  },
  finalizeRecording: async (params) => {
    await postApi("/telefun/finalize-recording", params);
  },
  scoreSession: async (sessionId) => {
    const response = await postApi<{ score: number; feedback: string; assessment?: any }>(`/telefun/score/${sessionId}`, {});
    return response || { score: 0, feedback: "" };
  },
};

export async function finalizeTelefunSession(params: {
  sessionId: string;
  fullBlob: Blob | null;
  agentBlob: Blob | null;
  duration: number;
  metrics: any;
  localUrl: string | null;
  sessionConfig: TelefunAppSettings | null;
  scenarioTitle: string;
  consumerName: string;
  dependencies?: Partial<FinalizerDependencies>;
}): Promise<{ record: CallRecord; scoringFailed: boolean; saveFailed: boolean; uploadFailed: boolean }> {
  const deps = { ...defaultDependencies, ...params.dependencies };
  let scoringFailed = false;
  let saveFailed = false;
  let uploadFailed = false;

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
        const path = buildTelefunRecordingPath({ userId, sessionId: params.sessionId, type: "full_call" });
        recordingPath = await deps.uploadRecording({ path, blob: params.fullBlob, type: "full_call" });
        if (!recordingPath) {
          uploadFailed = true;
        }
      } catch (err) {
        console.error("Full recording upload failed:", err);
        uploadFailed = true;
      }
    }
    if (params.agentBlob) {
      try {
        const path = buildTelefunRecordingPath({ userId, sessionId: params.sessionId, type: "agent_only" });
        agentRecordingPath = await deps.uploadRecording({ path, blob: params.agentBlob, type: "agent_only" });
        if (!agentRecordingPath) {
          uploadFailed = true;
        }
      } catch (err) {
        console.error("Agent recording upload failed:", err);
        uploadFailed = true;
      }
    }
  } else {
    if (params.fullBlob || params.agentBlob) {
      uploadFailed = true;
    }
  }

  // 4. Patch session status, duration, metrics without score/feedback first
  try {
    await deps.patchSession(params.sessionId, {
      status: "completed",
      duration_seconds: params.duration,
      session_metrics: params.metrics,
    });
  } catch (err) {
    console.error("Base session patch failed:", err);
    saveFailed = true;
  }

  // 5. Call finalize-recording if either path exists
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

  // 6. Call scoreSession only after agent recording path is persisted in DB
  let score = 0;
  let feedback = "";
  let voiceAssessment: any = undefined;
  if (agentRecordingPath) {
    try {
      const scoring = await deps.scoreSession(params.sessionId);
      if (scoring) {
        score = scoring.score || 0;
        feedback = scoring.feedback || "";
        voiceAssessment = scoring.assessment ?? undefined;
      }
    } catch (err) {
      console.error("Scoring failed:", err);
      scoringFailed = true;
    }
  } else {
    scoringFailed = true;
  }

  // 7. Patch score and feedback if scoring succeeds
  if (!scoringFailed && (score > 0 || feedback)) {
    try {
      await deps.patchSession(params.sessionId, {
        score,
        feedback,
      });
    } catch (err) {
      console.error("Failed to patch score and feedback:", err);
    }
  }

  const record: CallRecord = {
    id: params.sessionId,
    date: new Date().toISOString(),
    url: params.localUrl || "",
    consumerName: params.sessionConfig?.consumerName || params.consumerName,
    scenarioTitle: params.sessionConfig?.scenarioTitle || params.scenarioTitle || "Custom",
    duration: params.duration,
    recordingPath,
    agentRecordingPath,
    score,
    feedback,
    voiceAssessment,
    sessionMetrics: params.metrics,
    realisticModeEnabled: params.sessionConfig?.realisticModeEnabled || false,
    responsePacingMode: params.sessionConfig?.responsePacingMode,
    telefunModelId: params.sessionConfig?.telefunModelId,
    telefunTransport: params.sessionConfig?.telefunTransport,
    configuredDuration: params.sessionConfig?.maxCallDuration ? params.sessionConfig.maxCallDuration * 60 : undefined,
  };

  return {
    record,
    scoringFailed,
    saveFailed,
    uploadFailed,
  };
}
