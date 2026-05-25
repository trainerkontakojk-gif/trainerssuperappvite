export function getTelefunTimeCueThreshold(input: {
  totalSeconds: number;
  elapsedSeconds: number;
  cue30Sent: boolean;
  cue20Sent: boolean;
}): "30s" | "20s" | null {
  const remaining = input.totalSeconds - input.elapsedSeconds;
  if (remaining <= 30 && remaining > 20 && !input.cue30Sent) return "30s";
  if (remaining <= 20 && remaining > 0 && !input.cue20Sent) return "20s";
  return null;
}
