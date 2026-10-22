import { HttpsProxyAgent } from "https-proxy-agent";
import { env } from "./env.js";

const geminiAgent = env.GEMINI_PROXY_URL
  ? new HttpsProxyAgent(env.GEMINI_PROXY_URL)
  : undefined;

export function getGeminiProxyOptions() {
  return geminiAgent ? { agent: geminiAgent } : undefined;
}
