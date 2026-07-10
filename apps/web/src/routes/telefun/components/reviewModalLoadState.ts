import type { ReviewModalTab } from "./ReviewModal";
import type {
  ReplayAnnotation,
  CoachingRecommendation,
  VoiceDashboardMetrics,
} from "../services/reviewTypes";

export function shouldAutoLoadReviewPanel({
  activeTab,
  panelTab,
  loaded,
  loading,
  error,
}: {
  activeTab: ReviewModalTab;
  panelTab: Extract<ReviewModalTab, "voice_dashboard" | "replay">;
  loaded: boolean;
  loading: boolean;
  error?: string;
}): boolean {
  return (
    activeTab === panelTab &&
    !loaded &&
    !loading &&
    !error
  );
}

export function resolveReplayLoadResult({
  success,
  result,
  error,
}: {
  success: boolean;
  result?: {
    annotations: ReplayAnnotation[];
    recommendations: CoachingRecommendation[];
  };
  error?: string;
}) {
  const hasResult = !!result;
  const isCompleteSuccess = success && hasResult;

  return {
    annotations: hasResult ? result.annotations : [],
    recommendations: hasResult ? result.recommendations : [],
    loaded: isCompleteSuccess,
    error: isCompleteSuccess
      ? undefined
      : error || "Gagal menghasilkan anotasi.",
  };
}

export function resolveVoiceDashboardResult(result: {
  success: boolean;
  metrics?: VoiceDashboardMetrics | null;
  notice?: string;
  error?: string;
}): {
  metrics: VoiceDashboardMetrics | null;
  error: string | undefined;
  loaded: boolean;
  notice?: string;
} {
  if (!result.success) {
    return {
      metrics: null,
      error: result.error || "Gagal memuat metrik suara.",
      loaded: false,
    };
  }
  if (result.metrics) {
    return { metrics: result.metrics, error: undefined, loaded: true };
  }
  if (result.notice?.includes("Silakan coba lagi")) {
    return { metrics: null, error: result.notice, loaded: false };
  }
  return {
    metrics: null,
    notice: result.notice,
    error: undefined,
    loaded: true,
  };
}
