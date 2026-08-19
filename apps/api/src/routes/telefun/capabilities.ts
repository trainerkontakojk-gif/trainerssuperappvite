import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import {
  DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
  type TelefunWebRtcModelId,
} from "@trainers/types";
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
  allowedModelIds?: readonly TelefunWebRtcModelId[];
}) {
  const runtimeEnabled = isTelefunOpenAiWebRtcRuntimeEnabled(input);
  const allowed = isTelefunOpenAiWebRtcAllowed(input);
  const modelIds =
    input.allowedModelIds ?? DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS;

  return {
    openaiWebRtc: {
      enabled: runtimeEnabled && allowed,
      allowed,
      // Compatibility default during the transition window: always Full.
      // The Web gates the selected model on `modelIds`, never on `modelId`.
      modelId: OPENAI_WEBRTC_MODEL_ID,
      transport: OPENAI_WEBRTC_TRANSPORT,
      // Effective set = shared registry ∩ server-owned allowed-model config.
      modelIds,
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
      allowedModelIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
    }),
  });
});
