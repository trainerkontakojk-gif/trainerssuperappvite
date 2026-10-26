import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { isRetiredTelefunOpenAiRealtimeSelection } from "@trainers/types";
import { createAdminClient } from "../../lib/supabase";
import {
  analyzeVoiceQuality,
  generateCoachingSummary,
} from "../../lib/telefun-analysis";
import { buildTelefunFeedbackSummary } from "../../lib/telefun-feedback";
import { TELEFUN_OPENAI_SCORING_DISABLED_REASON } from "../../lib/telefun-openai-assessment";
import { isTelefunCaptureScoringReady } from "../../lib/telefun-capture-readiness";
import { aiRateLimitMiddleware } from "../../middleware/rateLimit";
import { requireCapability } from "../../middleware/role";
import {
  claimCompletedScoringForRerun,
  completeScoringAssessment,
  isWebRtcScoringReady,
  restoreScoringAfterFailedRerun,
} from "../../services/telefun-scoring-service";

type Variables = { user: User; profile: any };

const telefunRerun = new Hono<{ Variables: Variables }>();

/**
 * Telaah ulang: menilai ulang sesi yang sudah selesai dengan AI. Hasil lama
 * tetap dipakai bila penilaian baru gagal. Tidak dihitung batas harian, jadi
 * hanya trainer/admin.
 */
telefunRerun.post(
  "/score/:id/rerun",
  requireCapability("telefun.manage"),
  aiRateLimitMiddleware,
  async (c) => {
    // Middleware di depan membuat Hono kehilangan tipe parameter jalur.
    const id = c.req.param("id") ?? "";
    const user = c.get("user");
    const adminClient = createAdminClient();
    const rerunFailed = (previousKept: boolean) =>
      c.json(
        {
          success: false,
          error: {
            code: "RERUN_FAILED",
            message: previousKept
              ? "Telaah ulang belum berhasil. Hasil sebelumnya tetap dipakai."
              : "Telaah ulang belum berhasil. Coba lagi beberapa saat lagi.",
            details: { previousKept },
          },
        },
        502,
      );

    const { data: session, error: sessionError } = await adminClient
      .from("telefun_history")
      .select(
        "user_id, status, scoring_status, telefun_model_id, telefun_transport, recording_status, recording_error, recording_path, agent_recording_path, scoring_ready_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (sessionError) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: "Sesi belum dapat diperiksa.",
          },
        },
        503,
      );
    }
    if (!session) {
      return c.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." },
        },
        404,
      );
    }
    if (session.user_id !== user.id) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Anda tidak memiliki akses ke session ini.",
          },
        },
        403,
      );
    }
    if (
      isRetiredTelefunOpenAiRealtimeSelection({
        modelId: session.telefun_model_id,
        transport: session.telefun_transport,
      })
    ) {
      return c.json(
        {
          success: false,
          error: {
            code: "TELEFUN_OPENAI_SCORING_DISABLED",
            message: TELEFUN_OPENAI_SCORING_DISABLED_REASON,
          },
        },
        410,
      );
    }

    if (
      !isTelefunCaptureScoringReady(session, user.id, id) ||
      (session.telefun_transport === "openai-webrtc" &&
        !isWebRtcScoringReady(session, user.id, id))
    ) {
      return c.json(
        {
          success: false,
          error: {
            code: "SCORING_NOT_READY",
            message: "Rekaman wajib belum siap untuk telaah ulang.",
          },
        },
        409,
      );
    }

    let claimTokenHash: string | null;
    try {
      claimTokenHash =
        session.scoring_status === "completed"
          ? await claimCompletedScoringForRerun(id)
          : null;
    } catch {
      return c.json(
        {
          success: false,
          error: {
            code: "SCORING_STATE_UNAVAILABLE",
            message: "Status scoring belum dapat disimpan.",
          },
        },
        503,
      );
    }
    if (!claimTokenHash) {
      const { data: current } = await adminClient
        .from("telefun_history")
        .select(
          "user_id, status, recording_status, recording_error, recording_path, agent_recording_path, scoring_ready_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (
        current &&
        (!isTelefunCaptureScoringReady(current, user.id, id) ||
          (session.telefun_transport === "openai-webrtc" &&
            !isWebRtcScoringReady(current, user.id, id)))
      ) {
        return c.json(
          {
            success: false,
            error: {
              code: "SCORING_NOT_READY",
              message: "Rekaman wajib belum siap untuk telaah ulang.",
            },
          },
          409,
        );
      }
      return c.json(
        {
          success: false,
          error: {
            code: "SCORING_IN_PROGRESS",
            message: "Hanya hasil yang sudah selesai yang bisa ditelaah ulang.",
            details: { scoringStatus: session.scoring_status },
          },
        },
        409,
      );
    }
    console.log(`[Telefun Rerun] session=${id} action=claimed`);

    try {
      const result = await analyzeVoiceQuality(id, user.id, undefined, {
        fresh: true,
        claimTokenHash,
      });
      if (
        result.success &&
        result.assessment &&
        (await completeScoringAssessment(id, result.assessment, claimTokenHash))
      ) {
        // Hasil baru sudah tersimpan. Ringkasan coaching adalah panggilan AI
        // kedua (batas 3 menit); dijalankan setelah respons supaya pengguna
        // tidak ikut menunggunya.
        void generateCoachingSummary(id, user.id).catch(() => null);
        return c.json({
          success: true,
          data: {
            score: result.assessment.overallScore,
            feedback: buildTelefunFeedbackSummary(result.assessment),
            assessment: result.assessment,
          },
        });
      }
      console.error(
        `[Telefun Rerun] session=${id} action=failed error=${result.error ?? "not_completed"}`,
      );
    } catch (error: unknown) {
      console.error(
        `[Telefun Rerun] session=${id} action=error`,
        error instanceof Error ? error.message : error,
      );
    }
    return rerunFailed(
      await restoreScoringAfterFailedRerun(id, claimTokenHash),
    );
  },
);

export { telefunRerun };
