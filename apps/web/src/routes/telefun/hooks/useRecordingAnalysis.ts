import { useEffect, useMemo, useState } from "react";
import type { TelefunTranscriptEntry } from "@trainers/types";
import type { CallRecord } from "../types";
import {
  decodeEnvelope,
  speechOnsets,
  type AudioEnvelope,
} from "../utils/recordingAudio";
import {
  fetchTelefunRecordingUrl,
  type TelefunRecordingSource,
} from "./useTelefunRecordingUrl";

export type RecordingAnalysis =
  | { status: "loading" }
  | { status: "ready"; envelope: AudioEnvelope }
  | { status: "unavailable" };

/**
 * Selubung rekaman gabungan (gelombang pemutar) dan awal ucapan tiap baris
 * transkrip. Rekaman agen saja dipakai untuk memisahkan agen dari konsumen;
 * tanpa rekaman itu, waktu tercatat dipakai apa adanya.
 */
export function useRecordingAnalysis(
  record: Pick<CallRecord, "id" | "agentRecordingPath">,
  source: TelefunRecordingSource,
  transcript: readonly TelefunTranscriptEntry[],
) {
  const [analysis, setAnalysis] = useState<RecordingAnalysis>({
    status: "loading",
  });
  const [agent, setAgent] = useState<AudioEnvelope | null>(null);
  const fullUrl = source.status === "ready" ? source.url : null;
  const hasAgentTrack = Boolean(record.agentRecordingPath);

  useEffect(() => {
    if (!fullUrl) {
      setAnalysis({
        status: source.status === "loading" ? "loading" : "unavailable",
      });
      return;
    }
    const controller = new AbortController();
    setAnalysis({ status: "loading" });
    decodeEnvelope(fullUrl, controller.signal)
      .then((envelope) => setAnalysis({ status: "ready", envelope }))
      .catch(() => {
        if (!controller.signal.aborted) setAnalysis({ status: "unavailable" });
      });
    return () => controller.abort();
  }, [fullUrl, source.status]);

  useEffect(() => {
    setAgent(null);
    if (!fullUrl || !hasAgentTrack) return;
    const controller = new AbortController();
    fetchTelefunRecordingUrl(record.id, "agent_only")
      .then((url) => (url ? decodeEnvelope(url, controller.signal) : null))
      .then((envelope) => {
        if (!controller.signal.aborted) setAgent(envelope);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [record.id, fullUrl, hasAgentTrack]);

  const onsets = useMemo(
    () =>
      analysis.status === "ready" && agent
        ? speechOnsets(transcript, analysis.envelope, agent)
        : new Map<number, number>(),
    [analysis, agent, transcript],
  );

  return { analysis, onsets };
}
