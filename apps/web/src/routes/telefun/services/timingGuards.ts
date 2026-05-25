export function getTelefunTimeCueThreshold(input: {
  totalSeconds: number;
  elapsedSeconds: number;
  cue30Sent: boolean;
  cue20Sent: boolean;
}): "30s" | "20s" | null {
  if (input.totalSeconds <= 0) return null;

  const remaining = input.totalSeconds - input.elapsedSeconds;
  if (input.totalSeconds > 50 && remaining <= 30 && remaining > 20 && !input.cue30Sent)
    return "30s";
  if (input.totalSeconds > 20 && remaining <= 20 && remaining > 0 && !input.cue20Sent)
    return "20s";
  return null;
}
