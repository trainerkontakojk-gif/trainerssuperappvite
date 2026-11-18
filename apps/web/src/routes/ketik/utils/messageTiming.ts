import type { ChatMessage } from "@trainers/types";

/** A chat clock to the second, so response times can be read off the bubbles. */
export function formatMessageClock(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** The message's time, or null when it is missing or unparsable. */
export function messageDate(message: ChatMessage): Date | null {
  if (!message.timestamp) return null;
  const date = new Date(message.timestamp);
  return Number.isFinite(date.getTime()) ? date : null;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "12 dtk", "1 mnt 05 dtk", "1 jam 01 mnt 10 dtk". */
export function formatResponseGap(ms: number): string {
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours} jam ${pad(minutes)} mnt ${pad(seconds)} dtk`;
  if (minutes) return `${minutes} mnt ${pad(seconds)} dtk`;
  return `${seconds} dtk`;
}

/**
 * Response time per message: the time since the previous agent or consumer
 * message, set only on the first message of a turn (the sender changed) when
 * both messages carry a valid time. Consumer gaps include the simulation's
 * pauses and the time the AI took to write its reply.
 */
export function responseGaps(
  messages: ChatMessage[],
): Map<string, { sender: "agent" | "consumer"; ms: number }> {
  const gaps = new Map<string, { sender: "agent" | "consumer"; ms: number }>();
  let previous: ChatMessage | null = null;
  for (const message of messages) {
    if (message.sender === "system") continue;
    const before = previous;
    previous = message;
    if (!before || before.sender === message.sender) continue;
    const start = messageDate(before);
    const end = messageDate(message);
    if (!start || !end || end < start) continue;
    gaps.set(message.id, {
      sender: message.sender,
      ms: end.getTime() - start.getTime(),
    });
  }
  return gaps;
}
