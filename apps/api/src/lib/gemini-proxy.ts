import type { Fetch } from "@google/genai";
import { fetch, ProxyAgent } from "undici";
import { env } from "./env";

let geminiFetch: Fetch | undefined;

export function getGeminiProxyFetch(): Fetch | undefined {
  if (!env.GEMINI_PROXY_URL) return undefined;
  if (geminiFetch) return geminiFetch;

  const dispatcher = new ProxyAgent(env.GEMINI_PROXY_URL);
  // SDK fetch uses DOM types; undici supplies the matching runtime transport.
  const proxyFetch = fetch as unknown as Fetch;
  geminiFetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.hostname !== "generativelanguage.googleapis.com") {
      return globalThis.fetch(input, init);
    }
    try {
      const options = { ...init, dispatcher, redirect: "error" as const };
      return await proxyFetch(input, options);
    } catch {
      // Never pass transport errors (which may contain proxy credentials) to logs.
      throw new Error(
        "Layanan Gemini belum dapat dihubungi. Silakan coba lagi.",
      );
    }
  };
  return geminiFetch;
}
