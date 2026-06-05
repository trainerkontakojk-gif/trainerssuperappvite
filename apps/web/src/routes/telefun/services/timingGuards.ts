export type TelefunTimeCue = "2min" | "1min" | "30s" | "20s";

export function getTelefunTimeCueThreshold(input: {
  totalSeconds: number;
  elapsedSeconds: number;
  sentCues: ReadonlySet<TelefunTimeCue>;
}): TelefunTimeCue | null {
  if (input.totalSeconds <= 0) return null;

  const remaining = input.totalSeconds - input.elapsedSeconds;
  if (remaining <= 0) return null;

  let activeCue: TelefunTimeCue | null = null;
  if (input.totalSeconds >= 21 && remaining <= 20) {
    activeCue = "20s";
  } else if (input.totalSeconds >= 51 && remaining <= 30) {
    activeCue = "30s";
  } else if (input.totalSeconds >= 180 && remaining <= 60) {
    activeCue = "1min";
  } else if (input.totalSeconds >= 300 && remaining <= 120) {
    activeCue = "2min";
  }

  return activeCue && !input.sentCues.has(activeCue) ? activeCue : null;
}
