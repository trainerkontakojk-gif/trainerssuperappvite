import { Hono } from "hono";
import { User } from "@supabase/supabase-js";

const OPENAI_WEBRTC_MODEL_ID = "gpt-realtime-2.1" as const;
const OPENAI_WEBRTC_TRANSPORT = "openai-webrtc" as const;

type Variables = { user: User; profile: any };

export function resolveTelefunOpenAiWebRtcCapabilities(_input?: unknown) {
  return {
    openaiWebRtc: {
      enabled: false,
      allowed: false,
      // Deprecated shape compatibility only; modelIds is the authoritative
      // active set and remains empty after permanent retirement.
      modelId: OPENAI_WEBRTC_MODEL_ID,
      transport: OPENAI_WEBRTC_TRANSPORT,
      modelIds: [],
    },
  };
}

export const telefunCapabilities = new Hono<{ Variables: Variables }>();

telefunCapabilities.get("/capabilities", (c) => {
  return c.json({
    success: true,
    data: resolveTelefunOpenAiWebRtcCapabilities(),
  });
});
