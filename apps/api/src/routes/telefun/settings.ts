import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { User } from "@supabase/supabase-js";
import {
  getTelefunLiveModel,
  isValidTelefunModelTransportPair,
} from "@trainers/types";
import { createAdminClient } from "../../lib/supabase";

type Variables = { user: User; profile: any };

const telefunSettings = new Hono<{ Variables: Variables }>();

const TELEFUN_SIMULATION_CHALLENGE_IDS = [
  "technical_term_confusion",
  "repeated_question",
  "misunderstanding",
  "interruption",
  "incomplete_data",
  "unclear_voice",
  "emotional_escalation",
] as const;

export const telefunSimulationChallengeTypesSchema = z
  .array(z.enum(TELEFUN_SIMULATION_CHALLENGE_IDS))
  .max(3);

export const telefunSettingsPayloadSchema = z
  .object({
    selectedModel: z.string(),
    voiceName: z.string(),
    systemInstruction: z.string(),
    consumerName: z.string(),
    consumerGender: z.string(),
    scenarioTitle: z.string().optional(),
    scenarios: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          instruction: z.string(),
          isActive: z.boolean(),
          category: z.string().optional(),
          script: z.string().optional(),
        }),
      )
      .optional(),
    consumerTypes: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          gender: z.string(),
          description: z.string(),
          difficulty: z.string().optional(),
        }),
      )
      .optional(),
    maxCallDuration: z.number().optional(),
    responsePacingMode: z.enum(["realistic", "training_fast"]).optional(),
    simulationChallengeTypes: telefunSimulationChallengeTypesSchema.optional(),
    realisticModeEnabled: z.boolean().optional(),
    realisticModeDisruptionTypes: z.array(z.string()).optional(),
    preferredConsumerTypeId: z.string().optional(),
    identitySettings: z.any().optional(),
    telefunModelId: z.string().optional(),
    telefunTransport: z.enum(["gemini-live", "openai-audio"]).optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => {
    const hasModel = body.telefunModelId !== undefined;
    const hasTransport = body.telefunTransport !== undefined;
    if (!hasModel && !hasTransport) return;

    if (!hasModel || !hasTransport) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasModel ? ["telefunTransport"] : ["telefunModelId"],
        message: "Model dan transport Telefun harus dikirim bersama.",
      });
      return;
    }

    const modelId = body.telefunModelId;
    const transport = body.telefunTransport;
    if (modelId === undefined || transport === undefined) return;

    if (!getTelefunLiveModel(modelId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["telefunModelId"],
        message: "Model Telefun tidak dikenal.",
      });
      return;
    }

    if (!isValidTelefunModelTransportPair(modelId, transport)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["telefunTransport"],
        message: "Model dan transport Telefun tidak cocok.",
      });
    }
  });

telefunSettings.get("/settings", async (c) => {
  const user = c.get("user");
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient
      .from("user_settings")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    const telefunSettings = data?.settings?.telefun || null;
    return c.json({
      success: true,
      settings: telefunSettings,
      data: telefunSettings,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: {
          code: "DATABASE_ERROR",
          message: error?.message || "Database error.",
        },
      },
      500,
    );
  }
});

export function buildTelefunSettingsUpsertPayload(params: {
  userId: string;
  existingSettings: any;
  telefunSettings: any;
  now: string;
}) {
  return {
    user_id: params.userId,
    settings: {
      ...(params.existingSettings || {}),
      telefun: params.telefunSettings,
    },
    updated_at: params.now,
  };
}

telefunSettings.put(
  "/settings",
  zValidator("json", telefunSettingsPayloadSchema),
  async (c) => {
    const user = c.get("user");
    const adminClient = createAdminClient();
    const body = c.req.valid("json");

    try {
      const { data: existing } = await adminClient
        .from("user_settings")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle();

      const {
        realisticModeEnabled: _legacyEnabled,
        realisticModeDisruptionTypes: _legacyTypes,
        ...settingsToSave
      } = body;
      const upsertPayload = buildTelefunSettingsUpsertPayload({
        userId: user.id,
        existingSettings: existing?.settings,
        telefunSettings: settingsToSave,
        now: new Date().toISOString(),
      });

      const { error } = await adminClient
        .from("user_settings")
        .upsert(upsertPayload, { onConflict: "user_id" });

      if (error) throw error;
      return c.json({
        success: true,
        message: "Pengaturan Telefun berhasil disimpan.",
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: error?.message || "Database error.",
          },
        },
        500,
      );
    }
  },
);

export { telefunSettings };
