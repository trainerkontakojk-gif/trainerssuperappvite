import type { SupabaseClient } from "@supabase/supabase-js";
import {
  IMAGE_TAG_PATTERN_GLOBAL,
  type ChatMessage,
  type KetikHistoryAttachment,
} from "@trainers/types";

function imageSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const src = value.trim();
  if (
    /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,[a-z\d+/=\s]+$/i.test(
      src,
    )
  )
    return src;
  if (src.startsWith("/") && !src.startsWith("//") && !src.includes("\\"))
    return src;
  try {
    const url = new URL(src);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Caller must authorize the history first; bind snapshot lookup to its owner. */
export async function readHistoryAttachments(
  db: SupabaseClient,
  historyId: string,
  owner: string,
  messages: ChatMessage[],
): Promise<KetikHistoryAttachment[]> {
  const indexes = new Set<number>();
  // Use stored senders: the display normalizer reclassifies image-tagged text.
  for (const message of messages) {
    if (message.sender !== "consumer" && message.sender !== "system") continue;
    if (typeof message.text !== "string") continue;
    for (const match of message.text.matchAll(IMAGE_TAG_PATTERN_GLOBAL)) {
      const index = Number(match[0].match(/\d+/)?.[0]);
      if (Number.isSafeInteger(index)) indexes.add(index);
    }
  }
  if (indexes.size === 0) return [];
  const { data, error } = await db
    .from("ketik_sessions")
    .select("snapshot")
    .eq("history_id", historyId)
    .eq("user_id", owner)
    .eq("state", "ended")
    .maybeSingle();
  if (error) throw error;
  const scenario = data?.snapshot?.scenario;
  if (!Array.isArray(scenario?.images)) return [];
  return [...indexes]
    .sort((a, b) => a - b)
    .flatMap((index) => {
      const src = imageSource(scenario.images[index]);
      if (!src) return [];
      const rawAlt = Array.isArray(scenario.imageAlts)
        ? scenario.imageAlts[index]
        : null;
      const alt =
        typeof rawAlt === "string" && rawAlt.trim()
          ? rawAlt.trim().slice(0, 500)
          : `Lampiran skenario ${index + 1}`;
      return [{ index, src, alt }];
    });
}
