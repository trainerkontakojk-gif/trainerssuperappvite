export interface TranscriptMessage {
  id: string;
  sender: string;
  text: string;
}

type Sender = "consumer" | "agent";

/** Huruf kecil dan spasi dirapatkan, supaya kutipan AI cocok dengan transkrip. */
function fold(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

export function readMessages(value: unknown): TranscriptMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.sender === "string" &&
    typeof item.text === "string"
      ? [{ id: item.id, sender: item.sender, text: item.text }]
      : [],
  );
}

/**
 * Pesan pengirim `sender` yang memuat `quote`. Pesan yang disebut AI dicoba
 * dulu; bila salah, kutipan dicari di pesan lain dari pengirim yang sama.
 */
export function locateQuote(
  messages: TranscriptMessage[],
  sender: Sender,
  messageId: unknown,
  quote: string,
): string | null {
  const needle = fold(quote);
  const candidates = messages.filter((message) => message.sender === sender);
  const named = candidates.find((message) => message.id === messageId);
  const ordered = named
    ? [named, ...candidates.filter((message) => message !== named)]
    : candidates;
  return (
    ordered.find((message) => fold(message.text).includes(needle))?.id ?? null
  );
}
