import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "./env.js";
import { authorizeInternalScoring } from "./internal-scoring-auth.js";

export const INTERNAL_SCORING_PATH = "/internal/telefun/scoring";

interface InternalScoringDependencies {
  internalToken?: string;
}

const productionDependencies: InternalScoringDependencies = {
  internalToken: env.TELEFUN_INTERNAL_TOKEN,
};

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders = {},
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

/**
 * Compatibility endpoint for old scoring-worker deployments. It authenticates
 * its caller but permanently refuses retired OpenAI scoring before reading a
 * body or touching storage, sockets, evaluators, or usage persistence.
 */
export async function handleInternalScoringRequest(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: InternalScoringDependencies = productionDependencies,
): Promise<boolean> {
  const pathname = new URL(req.url ?? "/", "http://telefun.internal").pathname;
  if (pathname !== INTERNAL_SCORING_PATH) return false;

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

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });
    return true;
  }

  sendJson(res, 410, { error: "openai_scoring_disabled" });
  return true;
}
