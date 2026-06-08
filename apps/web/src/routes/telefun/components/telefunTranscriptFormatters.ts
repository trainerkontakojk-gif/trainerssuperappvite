import type { TelefunTranscriptSpeaker } from "@trainers/types";

export function formatTranscriptTimestamp(startMs: number): string {
  const totalSeconds = Math.floor(startMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getTranscriptSpeakerLabel(
  speaker: TelefunTranscriptSpeaker,
): "User/Agent" | "Konsumen" {
  return speaker === "agent" ? "User/Agent" : "Konsumen";
}
