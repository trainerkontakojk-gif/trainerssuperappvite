import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KetikReviewDetail,
  KetikSessionHistoryItem,
  KetikSessionReview,
  KetikTypoFinding,
} from "@trainers/types";
import { ketikApi } from "../ketikApi";

/** Batas tunggu telaah sebelum dilaporkan gagal. */
export const KETIK_REVIEW_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 3_000;

/**
 * Tahap telaah yang benar-benar diketahui klien; tidak ada persen yang
 * dikarang. `loading-result` berarti AI sudah selesai dan hasil sedang diambil.
 */
export type KetikReviewPhase =
  "idle" | "reviewing" | "loading-result" | "ready" | "failed";

/** Alasan gagal dalam bahasa peserta; detail teknis tidak diteruskan. */
export type KetikReviewFailure = "review" | "timeout" | "result";

export interface KetikReviewState {
  phase: KetikReviewPhase;
  failure: KetikReviewFailure | null;
  review: KetikSessionReview | null;
  typos: KetikTypoFinding[];
}

function withScores(
  session: KetikSessionHistoryItem,
  scores: KetikReviewDetail["scores"] | null | undefined,
): KetikSessionHistoryItem {
  const completed = { ...session, reviewStatus: "completed" as const };
  if (!scores) return completed;
  return {
    ...completed,
    finalScore: scores.final,
    empathyScore: scores.empathy,
    probingScore: scores.probing,
    resolutionScore: scores.resolution,
    typoScore: scores.typo,
    complianceScore: scores.compliance,
  };
}

const INITIAL: KetikReviewState = {
  phase: "idle",
  failure: null,
  review: null,
  typos: [],
};

/**
 * Status telaah satu sesi KETIK: memuat hasil yang sudah ada, menjalankan
 * telaah baru, dan memantau telaah yang sedang berjalan. Setiap perubahan status
 * sesi dikirim lewat `onSessionChange` supaya riwayat di halaman ikut segar.
 */
export function useKetikReviewStatus(
  session: KetikSessionHistoryItem | null,
  onSessionChange: (session: KetikSessionHistoryItem) => void,
) {
  const [state, setState] = useState<KetikReviewState>(INITIAL);
  const sessionRef = useRef(session);
  const onChangeRef = useRef(onSessionChange);
  // Disalin di effect (bukan saat render); effect ini dideklarasikan sebelum
  // effect lain sehingga selalu jalan lebih dulu.
  useEffect(() => {
    sessionRef.current = session;
    onChangeRef.current = onSessionChange;
  });
  // Setiap sesi/percobaan baru membatalkan hasil async percobaan sebelumnya.
  const runRef = useRef(0);
  const startedAtRef = useRef(0);

  const sessionId = session?.id ?? null;
  const status = session?.reviewStatus;

  const update = useCallback((next: KetikSessionHistoryItem) => {
    sessionRef.current = next;
    onChangeRef.current(next);
  }, []);

  const fail = useCallback(
    (run: number, failure: KetikReviewFailure) => {
      if (run !== runRef.current || !sessionRef.current) return;
      setState({ ...INITIAL, phase: "failed", failure });
      if (failure !== "result") {
        update({ ...sessionRef.current, reviewStatus: "failed" });
      }
    },
    [update],
  );

  const loadResult = useCallback(
    async (run: number) => {
      const current = sessionRef.current;
      if (!current) return;
      setState((prev) => ({ ...prev, phase: "loading-result", failure: null }));
      try {
        const detail = await ketikApi.getReviewDetail(current.id);
        if (run !== runRef.current) return;
        update(withScores(current, detail.scores));
        setState({
          phase: "ready",
          failure: null,
          review: detail.review,
          typos: detail.typos ?? [],
        });
      } catch (error) {
        console.error("[Ketik] Failed to load review result:", error);
        fail(run, "result");
      }
    },
    [fail, update],
  );

  // Sesi baru (atau status yang berubah dari luar): sesuaikan tampilan.
  useEffect(() => {
    const run = ++runRef.current;
    if (!sessionId) {
      setState(INITIAL);
      return;
    }
    if (status === "completed") {
      void loadResult(run);
    } else if (status === "processing") {
      startedAtRef.current = Date.now();
      setState({ ...INITIAL, phase: "reviewing" });
    } else if (status === "failed") {
      setState({ ...INITIAL, phase: "failed", failure: "review" });
    } else {
      setState(INITIAL);
    }
    // Status sengaja tidak jadi dependensi: perubahan yang dibuat hook ini
    // sendiri tidak boleh memulai ulang alurnya.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, loadResult]);

  // Pantau telaah yang sedang berjalan sampai selesai, gagal, atau melewati batas.
  useEffect(() => {
    if (state.phase !== "reviewing" || !sessionId) return;
    const run = runRef.current;
    const poll = async () => {
      if (Date.now() - startedAtRef.current > KETIK_REVIEW_TIMEOUT_MS) {
        fail(run, "timeout");
        return;
      }
      try {
        const data = await ketikApi.getReviewStatus(sessionId);
        if (run !== runRef.current) return;
        // Job bisa selesai sesaat sebelum hasilnya tersimpan; tunggu hasilnya.
        if (data.status === "completed" && data.resultReady) {
          void loadResult(run);
        } else if (data.status === "failed") {
          fail(run, "review");
        }
      } catch (error) {
        console.warn("[Ketik] Review status poll failed:", error);
      }
    };
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [state.phase, sessionId, fail, loadResult]);

  const start = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || state.phase === "reviewing") return;
    const run = ++runRef.current;
    startedAtRef.current = Date.now();
    setState({ ...INITIAL, phase: "reviewing" });
    update({ ...current, reviewStatus: "processing" });
    try {
      const result = await ketikApi.startReview(current.id);
      if (run !== runRef.current) return;
      if (result?.status === "completed") {
        void loadResult(run);
      } else if (result?.status === "failed") {
        fail(run, "review");
      }
      // Status lain (processing/queued): polling di atas yang meneruskan.
    } catch (error) {
      console.error("[Ketik] Failed to start review:", error);
      fail(run, "review");
    }
  }, [state.phase, fail, loadResult, update]);

  const retryResult = useCallback(() => {
    void loadResult(++runRef.current);
  }, [loadResult]);

  return { ...state, start, retryResult };
}
