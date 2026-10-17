import type { PdktMailboxItem, PdktScenario } from "@trainers/types";
import { PDKT_NO_SUBJECT } from "./emailDisplay";
import type { SessionHistory } from "./sessionHistory";
import type { PdktEvaluationEntry } from "./usePdktEvaluations";

/**
 * Read-only mailbox item for a history session whose email is no longer in
 * the mailbox, plus the review state to show with it. `null` when the session
 * saved no emails.
 */
export function buildReplayMailboxItem(
  session: SessionHistory,
): { item: PdktMailboxItem; evaluation: PdktEvaluationEntry } | null {
  const sessionEmails = Array.isArray(session.emails)
    ? (session.emails.filter(Boolean) as any[])
    : [];
  if (sessionEmails.length === 0) return null;

  const firstInbound = sessionEmails.find((e: any) => !e?.isAgent);
  const syntheticId = "replay_" + session.id;
  const ts =
    typeof session.timestamp === "string"
      ? session.timestamp
      : session.timestamp instanceof Date
        ? session.timestamp.toISOString()
        : new Date().toISOString();
  const cfg = (session.config ?? {}) as any;
  const item: PdktMailboxItem = {
    id: syntheticId,
    user_id: "",
    status: "replied",
    created_at: ts,
    sender_name: cfg.identity?.name || "Konsumen",
    sender_email: cfg.identity?.email || "",
    subject:
      (typeof (firstInbound as any)?.subject === "string"
        ? (firstInbound as any).subject
        : "") || PDKT_NO_SUBJECT,
    snippet:
      (typeof (firstInbound as any)?.body === "string"
        ? ((firstInbound as any).body as string).substring(0, 100)
        : "") || "",
    scenario_snapshot: cfg.scenarios?.[0] || ({} as PdktScenario),
    config_snapshot: cfg as any,
    inbound_email: (firstInbound || {
      id: "msg_replay",
      from: "",
      to: "",
      subject: "",
      body: "",
      timestamp: new Date().toISOString(),
      isAgent: false,
    }) as any,
    emails_thread: sessionEmails as any,
    history_id: session.id,
    last_activity_at: ts,
    time_taken: session.timeTaken ?? null,
    permissions: { can_delete: false },
    simulationSubject: session.simulationSubject ?? null,
  };

  return {
    item,
    evaluation: {
      result: session.evaluation || null,
      status: session.evaluationStatus || "completed",
      error: session.evaluationError || null,
    },
  };
}
