export const WAITING_APPROVAL_POLL_INTERVAL_MS = 5 * 60 * 1000;

export function shouldPollWaitingApproval(
  doc: Pick<Document, "visibilityState"> | undefined,
): boolean {
  return doc?.visibilityState !== "hidden";
}
