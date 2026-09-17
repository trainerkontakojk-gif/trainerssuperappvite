import type { QAIndicator } from "@trainers/types";
import { resolveServiceTypeFromTeam } from "./scoring";

export function resolveInitialInputService(
  tim?: string | null,
): QAIndicator["service_type"] | "" {
  if ((tim ?? "").trim().toLowerCase() === "mix") return "";
  return resolveServiceTypeFromTeam(tim) as QAIndicator["service_type"];
}
