import { supabaseAdmin } from "../../lib/supabase";

export const PDKT_MAILBOX_SUBJECT_INTENT_CLEANUP_INTERVAL_MS =
  15 * 60 * 1000;

export async function cleanupPdktMailboxSubjectIntents(): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc(
    "cleanup_pdkt_mailbox_subject_intents",
  );
  if (error) throw error;
  return typeof data === "number" ? data : Number(data ?? 0);
}

export interface PdktMailboxSubjectIntentCleanupHandle {
  stop: () => void;
}

export function startPdktMailboxSubjectIntentCleanup(options: {
  intervalMs?: number;
  cleanup?: () => Promise<number>;
  log?: (line: string) => void;
} = {}): PdktMailboxSubjectIntentCleanupHandle {
  const intervalMs =
    options.intervalMs ?? PDKT_MAILBOX_SUBJECT_INTENT_CLEANUP_INTERVAL_MS;
  const cleanup = options.cleanup ?? cleanupPdktMailboxSubjectIntents;
  const log = options.log ?? ((line: string) => console.log(line));
  let stopped = false;

  const run = async () => {
    if (stopped) return;
    try {
      const deleted = await cleanup();
      if (deleted > 0) {
        log(`[PDKT] Removed ${deleted} expired/consumed subject intents.`);
      }
    } catch (error) {
      // Cleanup is maintenance and must not take the API down. Keep the raw
      // database detail in server logs only; it is never a client response.
      console.error("[PDKT] Subject intent cleanup failed:", error);
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  (timer as unknown as { unref?: () => void }).unref?.();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
