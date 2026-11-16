import { useCallback, useEffect, useReducer, useRef } from "react";
import type { generateKetikReviewPdf } from "../utils/ketikReviewPdf";
import { useAuthStore } from "../../../store/authStore";
import { notify } from "../../../lib/toast";

type PdfInput = Parameters<typeof generateKetikReviewPdf>[0];
type PdfState =
  | { status: "idle" | "completed" | "failed" }
  | { status: "generating"; request: number };
type PdfEvent =
  | { type: "reset" }
  | { type: "start"; request: number }
  | { type: "completed" | "failed"; request: number };
function pdfReducer(state: PdfState, event: PdfEvent): PdfState {
  switch (event.type) {
    case "reset":
      return { status: "idle" };
    case "start":
      return state.status === "generating"
        ? state
        : { status: "generating", request: event.request };
    case "completed":
    case "failed":
      return state.status === "generating" && state.request === event.request
        ? { status: event.type }
        : state;
  }
}

export function useKetikReviewPdf(input: PdfInput | null) {
  const userId = useAuthStore((state) => state.session?.user.id);
  const [state, dispatch] = useReducer(pdfReducer, { status: "idle" });
  const current = useRef(state);
  const generation = useRef(0);
  const transition = useCallback((event: PdfEvent) => {
    current.current = pdfReducer(current.current, event);
    dispatch(event);
  }, []);
  const session = input?.session;
  const review = input?.review;
  const canRerun = input?.canRerun;
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
    };
    invalidate();
    transition({ type: "reset" });
    return invalidate;
  }, [session, review, canRerun, userId, transition]);

  const run = async () => {
    if (!input || current.current.status === "generating") return;
    const request = ++generation.current;
    const isCurrent = () =>
      generation.current === request &&
      useAuthStore.getState().session?.user.id === userId;
    transition({ type: "start", request });
    try {
      const [{ generateKetikReviewPdf }, { downloadPdf }] = await Promise.all([
        import("../utils/ketikReviewPdf"),
        import("../../../utils/sessionReviewPdf"),
      ]);
      if (!isCurrent()) return;
      const bytes = await generateKetikReviewPdf(input);
      if (!isCurrent()) return;
      downloadPdf(bytes, `ketik_telaah_${input.session.id}.pdf`);
      transition({ type: "completed", request });
    } catch {
      if (!isCurrent()) return;
      transition({ type: "failed", request });
      notify.error("PDF belum bisa dibuat. Coba lagi.");
    }
  };
  return { status: state.status, run };
}
