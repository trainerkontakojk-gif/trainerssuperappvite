import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import {
  env,
  isTelefunOpenAiWebRtcAllowed,
  isTelefunOpenAiWebRtcRuntimeEnabled,
} from "../../lib/env";

const OPENAI_WEBRTC_MODEL_ID = "gpt-realtime-2.1" as const;
const OPENAI_WEBRTC_TRANSPORT = "openai-webrtc" as const;

type Variables = { user: User; profile: any };

export function resolveTelefunOpenAiWebRtcCapabilities(input: {
  userId: string;
  enabled: boolean;
  nodeEnv: string;
  allowedUserIds: readonly string[];
}) {
  const runtimeEnabled = isTelefunOpenAiWebRtcRuntimeEnabled(input);
  const allowed = isTelefunOpenAiWebRtcAllowed(input);

  return {
    openaiWebRtc: {
      enabled: runtimeEnabled && allowed,
      allowed,
      modelId: OPENAI_WEBRTC_MODEL_ID,
      transport: OPENAI_WEBRTC_TRANSPORT,
    },
  };
}

export const telefunCapabilities = new Hono<{ Variables: Variables }>();

telefunCapabilities.get("/capabilities", (c) => {
  const user = c.get("user");
  return c.json({
    success: true,
    data: resolveTelefunOpenAiWebRtcCapabilities({
      userId: user.id,
      enabled: env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED,
      nodeEnv: env.NODE_ENV,
      allowedUserIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS,
    }),
  });
});
