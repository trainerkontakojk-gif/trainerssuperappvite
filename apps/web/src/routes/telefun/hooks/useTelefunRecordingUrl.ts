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
 * Unduh rekaman sekali ke tautan blob lokal. Gelombang, pemutar, geser, dan
 * tombol unduh memakai salinan ini, sehingga tiap buka Telaah hanya sekali
 * menarik rekaman dari storage (egress Supabase). Tautan bertanda tangan yang
 * sudah kedaluwarsa diganti sekali dengan tautan baru.
 */
async function downloadServerRecording(
  sessionId: string,
  signal: AbortSignal,
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const url = await fetchTelefunRecordingUrl(sessionId);
    if (!url) return null;
    const response = await fetch(url, { signal });
    if (response.ok) return URL.createObjectURL(await response.blob());
  }
  throw new Error("recording download failed");
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
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setSource({ status: "loading" });
    downloadServerRecording(record.id, controller.signal)
      .then((url) => {
        if (controller.signal.aborted) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSource(url ? { status: "ready", url } : { status: "unavailable" });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn("[Telefun] Failed to load recording", error);
        setSource({ status: "error" });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [record.id, record.url, hasServerRecording, attempt]);

  /** Unduh ulang, mis. setelah rekaman gagal dimuat. */
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { source, retry };
}
