import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("./env.js", () => ({ env: {} }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn(), storage: { from: vi.fn() } })),
}));

const { handleInternalScoringRequest, INTERNAL_SCORING_PATH } =
  await import("./internal-scoring-http.js");

const validBody = {
  sessionId: "session-1",
  userId: "user-1",
  modelId: "gpt-realtime-2.1",
};

function request({
  url = INTERNAL_SCORING_PATH,
  method = "POST",
  token = "internal-secret",
  body = validBody as unknown,
  rawBody,
}: {
  url?: string;
  method?: string;
  token?: string | null;
  body?: unknown;
  rawBody?: string;
} = {}) {
  const req = new EventEmitter() as any;
  req.url = url;
  req.method = method;
  req.headers = token ? { authorization: `Bearer ${token}` } : {};
  const on = req.on.bind(req);
  req.on = vi.fn((event: string, listener: (...args: any[]) => void) =>
    on(event, listener),
  );
  queueMicrotask(() => {
    const raw = rawBody ?? JSON.stringify(body);
    if (raw.length > 0) req.emit("data", Buffer.from(raw));
    req.emit("end");
  });
  return req;
}

function response() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers: Record<string, string>) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
    },
  } as any;
}

function dependencies() {
  return {
    openAIEnabled: true,
    openAIKey: "sk-test",
    internalToken: "internal-secret",
    loadInput: vi.fn(async () => ({
      scenarioTitle: "Scenario",
      audio: Buffer.from("webm"),
    })),
    convertAudio: vi.fn(async () => Buffer.from("pcm")),
    evaluate: vi.fn(async () => ({
      assessment: { overallScore: 8 },
      usage: { totalTokens: 10 },
    })),
    persistUsage: vi.fn(async () => true),
    createSocket: vi.fn(),
  } as any;
}

describe("handleInternalScoringRequest", () => {
  it("returns false for unrelated routes", async () => {
    const res = response();
    await expect(
      handleInternalScoringRequest(
        request({ url: "/health" }),
        res,
        dependencies(),
      ),
    ).resolves.toBe(false);
    expect(res.statusCode).toBe(0);
  });

  it("authenticates before reading the request body", async () => {
    const req = request({ token: null });
    const res = response();
    await expect(
      handleInternalScoringRequest(req, res, dependencies()),
    ).resolves.toBe(true);
    expect(res.statusCode).toBe(401);
    expect(req.on).not.toHaveBeenCalledWith("data", expect.any(Function));
  });

  it("rejects wrong methods, oversized bodies, malformed JSON, and non-OpenAI models", async () => {
    const deps = dependencies();
    const methodRes = response();
    await handleInternalScoringRequest(
      request({ method: "GET" }),
      methodRes,
      deps,
    );
    expect(methodRes.statusCode).toBe(405);

    const largeRes = response();
    await handleInternalScoringRequest(
      request({ rawBody: "x".repeat(9 * 1024) }),
      largeRes,
      deps,
    );
    expect(largeRes.statusCode).toBe(413);

    const malformedRes = response();
    await handleInternalScoringRequest(
      request({ rawBody: "{" }),
      malformedRes,
      deps,
    );
    expect(malformedRes.statusCode).toBe(400);

    const modelRes = response();
    await handleInternalScoringRequest(
      request({
        body: { ...validBody, modelId: "gemini-3.1-flash-live-preview" },
      }),
      modelRes,
      deps,
    );
    expect(modelRes.statusCode).toBe(422);
    expect(deps.loadInput).not.toHaveBeenCalled();

    const invalidIdRes = response();
    await handleInternalScoringRequest(
      request({ body: { ...validBody, sessionId: "" } }),
      invalidIdRes,
      deps,
    );
    expect(invalidIdRes.statusCode).toBe(400);
  });

  it("fails closed when OpenAI scoring is disabled", async () => {
    const deps = dependencies();
    deps.openAIEnabled = false;
    const res = response();
    await handleInternalScoringRequest(request(), res, deps);
    expect(res.statusCode).toBe(503);
    expect(deps.loadInput).not.toHaveBeenCalled();
  });

  it("evaluates, logs usage with the assessment action, and returns only the assessment", async () => {
    const deps = dependencies();
    const res = response();
    await handleInternalScoringRequest(request(), res, deps);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      success: true,
      assessment: { overallScore: 8 },
    });
    expect(res.headers).not.toHaveProperty("Access-Control-Allow-Origin");
    expect(deps.persistUsage).toHaveBeenCalledWith(
      "telefun-assessment-session-1",
      "user-1",
      expect.any(Object),
      "gpt-realtime-2.1",
      undefined,
      "voice_assessment",
    );
  });

  it("returns stable safe failures without reflecting upstream details", async () => {
    const deps = dependencies();
    deps.evaluate.mockRejectedValue(
      Object.assign(new Error("secret upstream body"), {
        code: "SOCKET_ERROR",
      }),
    );
    const res = response();
    await handleInternalScoringRequest(request(), res, deps);
    expect(res.statusCode).toBe(502);
    expect(res.body).toBe('{"error":"UPSTREAM_FAILURE"}');
    expect(res.body).not.toContain("secret upstream body");
  });
});
