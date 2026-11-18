// Shared by the ketik-session-api-*.spec.ts files.
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import type { Hono } from "hono";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./sidakRealBackend";
import { tnaApiRequest } from "./tnaApi";

export const env = readLoopbackEnv();

// ns, triggerName and suite are re-initialised by setupKetikSessionSuite()
// so each spec file starts from the same state with its own users.
export let ns = "";

export type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;

export let trainer: Identity;

export let agent: Identity;

export let app: Hono;

export let guardedFetch: typeof fetch;

export const suiteDefaults = () => ({
  failProvider: false,
  providerText: "Tagihan saya ganda.[BREAK]Mohon dibantu.",
  failAttachmentRead: false,
  providerCalls: 0,
  providerGate: null as (() => Promise<void>) | null,
  providerPayloads: [] as string[],
});

export const suite = suiteDefaults();

export let triggerName = "";

export function fixtureSql(query: string) {
  try {
    return runSql(env, query);
  } catch {
    throw new Error(
      "Loopback KETIK session fixture SQL failed (details withheld)",
    );
  }
}

export const marker = "e2e-private-session-provider-detail";

export async function api(
  who: Identity,
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return tnaApiRequest(app, `http://localhost/api/v1/ketik${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${who.token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function reveal(
  id: string,
  requestId: string,
  expectedAgentVersion: number,
  expectedRetryCount = 0,
) {
  return api(trainer, `/sessions/${id}/reveal`, "POST", {
    requestId,
    expectedAgentVersion,
    expectedRetryCount,
  });
}

export async function respondAndReveal(
  id: string,
  expectedAgentVersion: number,
  requestId = randomUUID(),
) {
  const result = await api(trainer, `/sessions/${id}/respond`, "POST", {
    requestId,
  });
  expect(result.status).toBe(200);
  const { pendingResponse } = (await result.json()).data;
  expect(pendingResponse).toMatchObject({ requestId, status: "held" });
  return reveal(
    id,
    requestId,
    expectedAgentVersion,
    pendingResponse.retryCount,
  );
}

export async function setupKetikSessionSuite() {
  // A failed setup must not make teardown delete the previous file's users.
  trainer = undefined as unknown as Identity;
  agent = undefined as unknown as Identity;
  ns = `ketik-session-${randomUUID().slice(0, 8)}`;
  triggerName = `e2e_${ns.replaceAll("-", "_")}`;
  Object.assign(suite, suiteDefaults());
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (suite.failAttachmentRead && url.pathname === "/rest/v1/ketik_sessions")
      return Response.json(
        { message: "private-attachment-read-sentinel", code: "XX000" },
        { status: 500 },
      );
    if (url.hostname === "api.openai.com" && url.pathname === "/v1/responses") {
      suite.providerCalls++;
      if (suite.providerGate) await suite.providerGate();
      if (suite.failProvider)
        return Response.json({ error: { message: marker } }, { status: 400 });
      return Response.json({
        id: ns,
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: suite.providerText,
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      });
    }
    // KETIK now coerces its model to Gemini; answer it the same way.
    if (url.hostname === "generativelanguage.googleapis.com") {
      suite.providerCalls++;
      suite.providerPayloads.push(await new Request(input, init).text());
      if (suite.providerGate) await suite.providerGate();
      if (suite.failProvider)
        return Response.json({ error: { message: marker } }, { status: 400 });
      return Response.json({
        candidates: [
          {
            content: { role: "model", parts: [{ text: suite.providerText }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      });
    }
    return guardedFetch(input, init);
  };
  trainer = await createUserWithJwt(env, "trainer", ns);
  agent = await createUserWithJwt(env, "agent", ns);
  app = (await import("../../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
  const saved = await api(trainer, "/settings", "PUT", {
    ...DEFAULT_KETIK_SETTINGS,
    selectedModel: "gpt-5.4-mini",
    responsePacingMode: "training_fast",
    identitySettings: {
      displayName: "Konsumen server",
      signatureName: "",
      phoneNumber: "0800000000",
      city: "Bandung",
    },
  });
  expect(saved.status).toBe(200);

  // Disposable-only instrumentation: every actual HTTP status UPDATE must run
  // inside the canonical transition function. INSERTs initialize rows. Keep a
  // separate name so tests can still install their own failure-injection trigger.
  fixtureSql(`
    CREATE FUNCTION public.${triggerName}_status() RETURNS trigger
    LANGUAGE plpgsql SET search_path = '' AS $$
    DECLARE stack text;
    BEGIN
      GET DIAGNOSTICS stack = PG_CONTEXT;
      IF position('transition_ketik_session_status(' IN stack) = 0 THEN
        RAISE EXCEPTION 'e2e-transition-bypass';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER ${triggerName}_status AFTER UPDATE OF state
      ON public.ketik_sessions FOR EACH ROW
      EXECUTE FUNCTION public.${triggerName}_status();
    CREATE TRIGGER ${triggerName}_status AFTER UPDATE OF status
      ON public.ketik_session_turns FOR EACH ROW
      EXECUTE FUNCTION public.${triggerName}_status();
    CREATE TRIGGER ${triggerName}_status AFTER UPDATE OF status
      ON public.ketik_session_responses FOR EACH ROW
      EXECUTE FUNCTION public.${triggerName}_status();
  `);
}

export async function teardownKetikSessionSuite() {
  globalThis.fetch = guardedFetch;
  fixtureSql(`
    DROP FUNCTION IF EXISTS public.${triggerName}_status() CASCADE;
    DROP FUNCTION IF EXISTS public.${triggerName}() CASCADE;
  `);
  for (const identity of [trainer, agent].filter(Boolean)) {
    const logs = await createAdmin(env)
      .from("ai_usage_logs")
      .delete()
      .eq("user_id", identity.userId);
    expect(logs.error).toBeNull();
    const deleted = await createAdmin(env).auth.admin.deleteUser(
      identity.userId,
    );
    expect(deleted.error).toBeNull();
  }
}

export async function start(who = trainer) {
  const response = await api(who, "/sessions", "POST", {
    requestId: randomUUID(),
  });
  expect(response.status).toBe(200);
  return (await response.json()).data;
}

export function consumerPromptIdentity(raw: string) {
  const text = JSON.parse(raw)
    .systemInstruction.parts.map((part: { text: string }) => part.text)
    .join("\n");
  return JSON.parse(
    text.split("<scenario_data>\n")[1].split("\n</scenario_data>")[0],
  ).identity;
}
