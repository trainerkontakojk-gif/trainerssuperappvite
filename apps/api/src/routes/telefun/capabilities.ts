import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { DEFAULT_TELEFUN_OPENAI_WEBRTC_MODEL_ID } from "../../lib/ai-models";

const OPENAI_WEBRTC_MODEL_ID = DEFAULT_TELEFUN_OPENAI_WEBRTC_MODEL_ID;
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
