import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("./env.js", () => ({ env: {} }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn(), storage: { from: vi.fn() } })),
}));

const { handleInternalScoringRequest, INTERNAL_SCORING_PATH } =
  await import("./internal-scoring-http.js");

function request({
  url = INTERNAL_SCORING_PATH,
  method = "POST",
  token = "internal-secret",
  body = '{"sessionId":"historical"}',
}: {
  url?: string;
  method?: string;
  token?: string | null;
  body?: string;
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
    if (body) req.emit("data", Buffer.from(body));
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
    loadInput: vi.fn(),
    convertAudio: vi.fn(),
    evaluate: vi.fn(),
    persistUsage: vi.fn(),
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

  it("authenticates before touching the request body", async () => {
    const req = request({ token: null });
    const res = response();

    await expect(
      handleInternalScoringRequest(req, res, dependencies()),
    ).resolves.toBe(true);

    expect(res.statusCode).toBe(401);
    expect(req.on).not.toHaveBeenCalledWith("data", expect.any(Function));
  });

  it("returns the permanent 410 after authentication without body, storage, socket, evaluator, or usage work", async () => {
    const req = request();
    const res = response();
    const deps = dependencies();

    await expect(handleInternalScoringRequest(req, res, deps)).resolves.toBe(
      true,
    );

    expect(res.statusCode).toBe(410);
    expect(res.body).toBe('{"error":"openai_scoring_disabled"}');
    expect(req.on).not.toHaveBeenCalledWith("data", expect.any(Function));
    expect(deps.loadInput).not.toHaveBeenCalled();
    expect(deps.convertAudio).not.toHaveBeenCalled();
    expect(deps.evaluate).not.toHaveBeenCalled();
    expect(deps.persistUsage).not.toHaveBeenCalled();
    expect(deps.createSocket).not.toHaveBeenCalled();
  });

  it("authenticates before returning a method error", async () => {
    const unauthorized = response();
    await handleInternalScoringRequest(
      request({ method: "GET", token: null }),
      unauthorized,
      dependencies(),
    );
    expect(unauthorized.statusCode).toBe(401);

    const authorized = response();
    await handleInternalScoringRequest(
      request({ method: "GET" }),
      authorized,
      dependencies(),
    );
    expect(authorized.statusCode).toBe(405);
  });
});
