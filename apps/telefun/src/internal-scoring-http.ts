import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocket } from "ws";
import {
  getTelefunLiveModel,
  type VoiceQualityAssessment,
} from "@trainers/types";
import { env } from "./env.js";
import { authorizeInternalScoring } from "./internal-scoring-auth.js";
import {
  getOpenAIScoringInput,
  convertWebMToPcm24kMono,
} from "./scoring-audio.js";
import {
  evaluateOpenAIVoiceAssessment,
  type OpenAISocketFactory,
} from "./openai-voice-assessment.js";
import {
  flushOpenAIRealtimeUsage,
  type OpenAIUsageAggregate,
} from "./usage.js";

export const INTERNAL_SCORING_PATH = "/internal/telefun/scoring";
export const MAX_INTERNAL_SCORING_BODY_BYTES = 8 * 1024;

interface InternalScoringBody {
  sessionId: string;
  userId: string;
  modelId: string;
}

interface InternalScoringDependencies {
  openAIEnabled: boolean;
  openAIKey?: string;
  internalToken?: string;
  loadInput(body: InternalScoringBody): Promise<{
    scenarioTitle: string;
    audio: Buffer;
  }>;
  convertAudio(audio: Buffer): Promise<Buffer>;
  evaluate(options: {
    modelId: string;
    userId: string;
    scenarioTitle: string;
    pcmAudio: Buffer;
    apiKey: string;
    createSocket: OpenAISocketFactory;
  }): Promise<{
    assessment: VoiceQualityAssessment;
    usage: OpenAIUsageAggregate;
  }>;
  persistUsage(
    requestId: string,
    userId: string,
    usage: OpenAIUsageAggregate,
    modelId: string,
    sessionDurationMs: undefined,
    action: "voice_assessment",
  ): Promise<boolean>;
  createSocket: OpenAISocketFactory;
}

const createProductionRealtimeSocket: OpenAISocketFactory = (url, options) =>
  new WebSocket(url, { headers: options?.headers ?? {} }) as any;

const productionDependencies: InternalScoringDependencies = {
  openAIEnabled: env.TELEFUN_OPENAI_ENABLED,
  openAIKey: env.OPENAI_API_KEY,
  internalToken: env.TELEFUN_INTERNAL_TOKEN,
  loadInput: getOpenAIScoringInput,
  convertAudio: convertWebMToPcm24kMono,
  evaluate: evaluateOpenAIVoiceAssessment,
  persistUsage: flushOpenAIRealtimeUsage,
  createSocket: createProductionRealtimeSocket,
};

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders = {},
) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_INTERNAL_SCORING_BODY_BYTES) {
        reject(
          Object.assign(new Error("body_too_large"), {
            code: "BODY_TOO_LARGE",
          }),
        );
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > MAX_INTERNAL_SCORING_BODY_BYTES) return;
      try {
        resolve(
          chunks.length === 0
            ? {}
            : JSON.parse(Buffer.concat(chunks).toString("utf8")),
        );
      } catch {
        reject(
          Object.assign(new Error("invalid_json"), { code: "INVALID_JSON" }),
        );
      }
    });
    req.on("error", () =>
      reject(
        Object.assign(new Error("request_error"), { code: "REQUEST_ERROR" }),
      ),
    );
  });
}

function parseBody(value: unknown): InternalScoringBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { sessionId, userId, modelId } = value as Record<string, unknown>;
  if (
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    sessionId.length > 128 ||
    typeof userId !== "string" ||
    userId.length === 0 ||
    userId.length > 128 ||
    typeof modelId !== "string" ||
    modelId.length === 0 ||
    modelId.length > 128
  )
    return null;
  return { sessionId, userId, modelId };
}

function safeFailure(code: string): { status: number; code: string } {
  if (code === "MODEL_MISMATCH" || code === "INVALID_STATUS")
    return { status: 409, code };
  if (
    code === "NO_RECORDING" ||
    code === "TOO_LARGE" ||
    code === "INVALID_AUDIO"
  ) {
    return { status: 422, code };
  }
  if (code === "CONNECT_TIMEOUT" || code === "EVALUATION_TIMEOUT") {
    return { status: 504, code: "UPSTREAM_TIMEOUT" };
  }
  return { status: 502, code: "UPSTREAM_FAILURE" };
}

/** Owns only the authenticated internal scoring route; unrelated routes return false. */
export async function handleInternalScoringRequest(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: InternalScoringDependencies = productionDependencies,
): Promise<boolean> {
  const pathname = new URL(req.url ?? "/", "http://telefun.internal").pathname;
  if (pathname !== INTERNAL_SCORING_PATH) return false;
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });
    return true;
  }

  const authorization =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization
      : undefined;
  if (
    !authorizeInternalScoring(authorization, dependencies.internalToken ?? "")
  ) {
    sendJson(res, 401, { error: "invalid_internal_token" });
    return true;
  }
  if (!dependencies.openAIEnabled || !dependencies.openAIKey) {
    sendJson(res, 503, { error: "openai_scoring_disabled" });
    return true;
  }

  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(req);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    sendJson(res, code === "BODY_TOO_LARGE" ? 413 : 400, {
      error: code === "BODY_TOO_LARGE" ? "body_too_large" : "invalid_json",
    });
    return true;
  }
  const body = parseBody(rawBody);
  if (!body) {
    sendJson(res, 400, { error: "invalid_payload" });
    return true;
  }
  const model = getTelefunLiveModel(body.modelId);
  if (
    model?.provider !== "openai" ||
    model.realtime.transport !== "openai-audio"
  ) {
    sendJson(res, 422, { error: "invalid_model" });
    return true;
  }

  try {
    const input = await dependencies.loadInput(body);
    const pcmAudio = await dependencies.convertAudio(input.audio);
    const result = await dependencies.evaluate({
      modelId: body.modelId,
      userId: body.userId,
      scenarioTitle: input.scenarioTitle,
      pcmAudio,
      apiKey: dependencies.openAIKey,
      createSocket: dependencies.createSocket,
    });
    const usagePersisted = await dependencies.persistUsage(
      `telefun-assessment-${body.sessionId}`,
      body.userId,
      result.usage,
      body.modelId,
      undefined,
      "voice_assessment",
    );
    if (!usagePersisted) {
      sendJson(res, 502, { error: "usage_persistence_failed" });
      return true;
    }
    sendJson(res, 200, { success: true, assessment: result.assessment });
    return true;
  } catch (error) {
    const failure = safeFailure(
      (error as { code?: string })?.code ?? "UNKNOWN",
    );
    sendJson(res, failure.status, { error: failure.code });
    return true;
  }
}
