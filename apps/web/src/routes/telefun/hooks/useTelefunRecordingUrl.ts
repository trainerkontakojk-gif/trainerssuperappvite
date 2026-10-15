import { useCallback, useEffect, useState } from "react";
import { telefunClient, unwrapResponse } from "../../../lib/api";
import type { CallRecord } from "../types";

export type TelefunRecordingSource =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "unavailable" }
  | { status: "error" };

/** Tautan bertanda tangan untuk rekaman yang tersimpan di server. */
export async function fetchTelefunRecordingUrl(
  sessionId: string,
  type?: "agent_only",
): Promise<string | null> {
  const json = (await unwrapResponse(
    await telefunClient.recording[":id"].$get({
      param: { id: sessionId },
      ...(type ? { query: { type } } : {}),
    }),
  )) as { url?: unknown } | null;
  return typeof json?.url === "string" && json.url ? json.url : null;
}

/**
 * Sumber rekaman untuk Telaah. Rekaman di server didahulukan (tautan blob
 * lokal bisa basi setelah muat ulang); blob lokal hanya dipakai bila sesi
 * belum punya rekaman di server.
 */
export function useTelefunRecordingUrl(
  record: Pick<
    CallRecord,
    "id" | "url" | "recordingPath" | "agentRecordingPath"
  >,
) {
  const [source, setSource] = useState<TelefunRecordingSource>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  const hasServerRecording = Boolean(
    record.recordingPath || record.agentRecordingPath,
  );

  useEffect(() => {
    if (!hasServerRecording) {
      setSource(
        record.url
          ? { status: "ready", url: record.url }
          : { status: "unavailable" },
      );
      return;
    }
    let cancelled = false;
    setSource({ status: "loading" });
    fetchTelefunRecordingUrl(record.id)
      .then((url) => {
        if (cancelled) return;
        setSource(url ? { status: "ready", url } : { status: "unavailable" });
      })
      .catch((error) => {
        console.warn("[Telefun] Failed to load recording URL", error);
        if (!cancelled) setSource({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [record.id, record.url, hasServerRecording, attempt]);

  /** Minta tautan baru, mis. setelah tautan bertanda tangan kedaluwarsa. */
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { source, retry };
}
