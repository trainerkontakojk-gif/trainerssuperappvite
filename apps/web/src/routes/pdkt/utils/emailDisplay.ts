import type { PdktMailboxDetailItem } from "@trainers/types";

/** "11 Okt 2026, 14.20" dalam zona waktu perangkat. */
export function formatPdktEmailDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day}, ${time}`;
}

export function getPdktInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.trim().substring(0, 2).toUpperCase();
}

/** Isi dan lampiran email konsumen; payload lama bisa tanpa salah satunya. */
export function readInboundEmail(
  item: Pick<PdktMailboxDetailItem, "inbound_email">,
): {
  body: string;
  attachments: string[];
} {
  const inbound = (item.inbound_email ?? {}) as {
    body?: unknown;
    attachments?: unknown;
  };
  return {
    body: typeof inbound.body === "string" ? inbound.body : "",
    attachments: Array.isArray(inbound.attachments)
      ? inbound.attachments.filter(
          (attachment): attachment is string => typeof attachment === "string",
        )
      : [],
  };
}

/** Balasan peserta di utas email (pesan pertama dari agent). */
export function readAgentReply(
  item: Pick<PdktMailboxDetailItem, "emails_thread">,
): string {
  const thread = Array.isArray(item.emails_thread) ? item.emails_thread : [];
  const reply = thread.find(
    (email: { isAgent?: boolean } | null | undefined) => email?.isAgent,
  ) as { body?: unknown } | undefined;
  return typeof reply?.body === "string" ? reply.body : "";
}
