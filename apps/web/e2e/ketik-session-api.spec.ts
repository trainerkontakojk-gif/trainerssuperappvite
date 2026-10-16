import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_KETIK_SETTINGS, KETIK_DUMMY_CONSUMERS } from "@trainers/types";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const ns = `ketik-session-${randomUUID().slice(0, 8)}`;
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
let trainer: Identity;
let agent: Identity;
let app: Hono;
let guardedFetch: typeof fetch;
let failProvider = false;
let providerText = "Tagihan saya ganda.[BREAK]Mohon dibantu.";
let failAttachmentRead = false;
let providerCalls = 0;
let providerGate: (() => Promise<void>) | null = null;
const triggerName = `e2e_${ns.replaceAll("-", "_")}`;
function fixtureSql(query: string) {
  try {
    return runSql(env, query);
  } catch {
    throw new Error(
      "Loopback KETIK session fixture SQL failed (details withheld)",
    );
  }
}
const marker = "e2e-private-session-provider-detail";

async function api(
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

test.beforeAll(async () => {
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
    if (failAttachmentRead && url.pathname === "/rest/v1/ketik_sessions") return Response.json({ message: "private-attachment-read-sentinel", code: "XX000" }, { status: 500 });
    if (url.hostname === "api.openai.com" && url.pathname === "/v1/responses") {
      providerCalls++;
      if (providerGate) await providerGate();
      if (failProvider)
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
                text: providerText,
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      });
    }
    return guardedFetch(input, init);
  };
  trainer = await createUserWithJwt(env, "trainer", ns);
  agent = await createUserWithJwt(env, "agent", ns);
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../api/src/lib/env");
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
});

test.afterAll(async () => {
  globalThis.fetch = guardedFetch;
  fixtureSql(`DROP FUNCTION IF EXISTS public.${triggerName}() CASCADE;`);
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
});

test("server creates an immutable owner-scoped session, and strict input rejects browser authority", async () => {
  const requestId = randomUUID();
  const response = await api(trainer, "/sessions", "POST", {
    requestId,
    simulationSubject: { type: "self" },
  });
  expect(response.status).toBe(200);
  const session = (await response.json()).data;
  expect(session).toMatchObject({
    state: "active",
    version: 0,
    provenance: "server_v1",
    config: {
      selectedModel: "gpt-5.4-mini",
      identity: { name: "Konsumen server" },
    },
  });
  expect(Date.parse(session.expiresAt)).toBeGreaterThan(
    Date.parse(session.startedAt),
  );
  const duplicate = await api(trainer, "/sessions", "POST", {
    requestId,
    simulationSubject: { type: "self" },
  });
  expect((await duplicate.json()).data.id).toBe(session.id);
  expect((await api(agent, `/sessions/${session.id}`)).status).toBe(404);
  for (const extra of [
    { selectedModel: "gemini-3.8-flash" },
    { messages: [] },
    { scenarioDraft: {} },
    { elapsedSeconds: -1 },
  ]) {
    expect(
      (
        await api(trainer, "/sessions", "POST", {
          requestId: randomUUID(),
          ...extra,
        })
      ).status,
    ).toBe(400);
  }
});

async function start(who = trainer) {
  const response = await api(who, "/sessions", "POST", {
    requestId: randomUUID(),
  });
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
test("unassigned agents cannot start; explicit assignment enables a private server session", async () => {
  const denied = await api(agent, "/sessions", "POST", {
    requestId: randomUUID(),
  });
  expect(denied.status).toBe(409);
  expect((await denied.json()).error.code).toBe("ASSIGNMENT_REQUIRED");
  const source = await api(trainer, "/settings");
  const target = await api(trainer, `/assignments/${agent.userId}`);
  const assigned = await api(trainer, `/assignments/${agent.userId}`, "PUT", {
    sourceSettingsVersion: source.headers.get("x-settings-version"),
    recipientSettingsVersion: (await target.json()).data
      .recipientSettingsVersion,
    expectedAssignmentVersion: null,
  });
  expect(assigned.status).toBe(200);
  expect((await start(agent)).config.selectedModel).toBe("gpt-5.4-mini");
});
test("messages, time, model and finalized history come from the server and duplicates spend no extra AI", async () => {
  const session = await start();
  const request = {
    requestId: randomUUID(),
    expectedVersion: 0,
    text: "Selamat pagi.",
  };
  const calls = providerCalls;
  const response = await api(
    trainer,
    `/sessions/${session.id}/turns`,
    "POST",
    request,
  );
  expect(response.status).toBe(200);
  const updated = (await response.json()).data;
  expect(updated.version).toBe(2);
  expect(updated.messages.map((m: { sender: string }) => m.sender)).toEqual([
    "system",
    "agent",
    "consumer",
    "consumer",
  ]);
  expect(updated.messages.map((m: { text: string }) => m.text)).toContain(
    "Tagihan saya ganda.",
  );
  expect(providerCalls).toBe(calls + 1);
  const repeated = await api(
    trainer,
    `/sessions/${session.id}/turns`,
    "POST",
    request,
  );
  expect((await repeated.json()).data.messages).toEqual(updated.messages);
  expect(providerCalls).toBe(calls + 1);
  expect(
    (
      await api(trainer, `/sessions/${session.id}/turns`, "POST", {
        ...request,
        text: "changed",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await api(trainer, `/sessions/${session.id}/turns`, "POST", {
        ...request,
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(409);
  expect(
    (await api(agent, `/sessions/${session.id}/turns`, "POST", request)).status,
  ).toBe(404);
  expect(
    (
      await api(trainer, `/sessions/${session.id}/finish`, "POST", {
        messages: [],
        finalScore: 100,
      })
    ).status,
  ).toBe(400);
  const finished = await api(
    trainer,
    `/sessions/${session.id}/finish`,
    "POST",
    {},
  );
  expect(finished.status).toBe(200);
  expect((await finished.json()).data.messages).toEqual(updated.messages);
  const repeatedFinish = await api(
    trainer,
    `/sessions/${session.id}/finish`,
    "POST",
    {},
  );
  expect((await repeatedFinish.json()).data.id).toBe(session.id);
  const db = createAdmin(env);
  const active = await db
    .from("ketik_sessions")
    .select("messages,state")
    .eq("id", session.id)
    .single();
  expect(active.data).toEqual({ messages: null, state: "ended" });
  const history = await db
    .from("ketik_history")
    .select("messages,final_score,review_status,transcript_provenance")
    .eq("id", session.id)
    .single();
  expect(history.data).toEqual({
    messages: updated.messages,
    final_score: null,
    review_status: "pending",
    transcript_provenance: "server_v1",
  });
  const loaded = await api(trainer, `/sessions/${session.id}`);
  expect((await loaded.json()).data.messages).toEqual(updated.messages);
  expect(
    (
      await api(trainer, `/sessions/${session.id}/turns`, "POST", {
        requestId: randomUUID(),
        expectedVersion: 2,
        text: "too late",
      })
    ).status,
  ).toBe(409);
  const logs = await db
    .from("ai_usage_logs")
    .select("total_tokens")
    .eq("user_id", trainer.userId)
    .eq("module", "ketik");
  expect(logs.error).toBeNull();
  expect(logs.data?.some((row) => row.total_tokens === 15)).toBe(true);
});
test("provider failure is explicit and retry preserves exactly one agent message", async () => {
  const session = await start();
  const request = {
    requestId: randomUUID(),
    expectedVersion: 0,
    text: "Mohon bantuan.",
  };
  failProvider = true;
  try {
    const failed = await api(
      trainer,
      `/sessions/${session.id}/turns`,
      "POST",
      request,
    );
    expect(failed.status).toBe(502);
    expect(JSON.stringify(await failed.json())).not.toContain(marker);
  } finally {
    failProvider = false;
  }
  const loaded = await api(trainer, `/sessions/${session.id}`);
  expect((await loaded.json()).data.pendingTurn.status).toBe("failed");
  expect(
    (
      await api(trainer, `/sessions/${session.id}/turns`, "POST", {
        ...request,
        requestId: randomUUID(),
        expectedVersion: 1,
      })
    ).status,
  ).toBe(409);
  const retried = await api(
    trainer,
    `/sessions/${session.id}/turns`,
    "POST",
    request,
  );
  expect(retried.status).toBe(200);
  expect(
    (await retried.json()).data.messages.filter(
      (m: { sender: string }) => m.sender === "agent",
    ),
  ).toHaveLength(1);
});
test("expiry is enforced server-side and empty finalized sessions are discarded idempotently", async () => {
  const session = await start();
  const db = createAdmin(env);
  const changed = await db
    .from("ketik_sessions")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", session.id);
  expect(changed.error).toBeNull();
  expect(
    (
      await api(trainer, `/sessions/${session.id}/turns`, "POST", {
        requestId: randomUUID(),
        expectedVersion: 0,
        text: "expired",
      })
    ).status,
  ).toBe(410);
  for (let i = 0; i < 2; i++) {
    const finished = await api(
      trainer,
      `/sessions/${session.id}/finish`,
      "POST",
      {},
    );
    expect(finished.status).toBe(200);
    expect((await finished.json()).data).toBeNull();
  }
  const history = await db
    .from("ketik_history")
    .select("id")
    .eq("id", session.id);
  expect(history.data).toEqual([]);
});
test("legacy transcript and generation endpoints cannot bypass session authority", async () => {
  const calls = providerCalls;
  for (const path of ["/generate", "/history"]) {
    const response = await api(trainer, path, "POST", {
      ...DEFAULT_KETIK_SETTINGS,
      scenarioId: "pinjol",
      consumerTypeId: "marah",
      identity: { name: "forged", city: "", phone: "" },
      chatHistory: [],
      scenarioTitle: "forged",
      consumerName: "forged",
      consumerPhone: "",
      consumerCity: "",
      messages: [],
    });
    expect(response.status).toBe(410);
  }
  expect(providerCalls).toBe(calls);
});
test("historical attachments use the immutable session snapshot, sent-only projection and existing authorization", async () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ZkAAAAASUVORK5CYII=";
  const settingsResponse = await api(trainer, "/settings");
  const original = (await settingsResponse.json()).data;
  try {
    const settings = { ...original, scenarios: original.scenarios.map((scenario: { id: string }, index: number) => ({ ...scenario, isActive: index === 0, images: [png, "https://example.invalid/unsent-private.png", "javascript:alert(1)"], imageAlts: ["Bukti asli", "Tidak dikirim", "Sumber tidak aman"], script: "private-scenario-script-sentinel" })) };
    expect((await api(trainer, "/settings", "PUT", settings, { "x-settings-version": settingsResponse.headers.get("x-settings-version")! })).status).toBe(200);
    const session = await start();
    providerText = "Ini bukti tagihannya [SEND_IMAGE:0] [SEND_IMAGE:2] [SEND_IMAGE:9]";
    const turn = await api(trainer, `/sessions/${session.id}/turns`, "POST", { requestId: randomUUID(), expectedVersion: session.version, text: "Boleh kirim bukti tagihan? [SEND_IMAGE:1]" });
    expect(turn.status).toBe(200);
    expect((await api(trainer, `/sessions/${session.id}/finish`, "POST", {})).status).toBe(200);
    const latest = await api(trainer, "/settings");
    const changed = { ...settings, scenarios: settings.scenarios.map((scenario: Record<string, unknown>) => ({ ...scenario, images: ["https://example.invalid/latest-settings.png"], imageAlts: ["Bukti terbaru"] })) };
    expect((await api(trainer, "/settings", "PUT", changed, { "x-settings-version": latest.headers.get("x-settings-version")! })).status).toBe(200);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await api(trainer, `/history/${session.id}`);
      expect(response.status).toBe(200);
      const detail = (await response.json()).data;
      expect(detail.attachments).toEqual([{ index: 0, src: png, alt: "Bukti asli" }]);
      expect(JSON.stringify(detail)).not.toMatch(/unsent-private|latest-settings|private-scenario-script|javascript:/);
    }
    expect((await api(agent, `/history/${session.id}`)).status).toBe(404);
    const list = (await (await api(trainer, "/history")).json()).data;
    expect(list.items.every((item: Record<string, unknown>) => !("attachments" in item))).toBe(true);
    failAttachmentRead = true;
    const failed = await api(trainer, `/history/${session.id}`);
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("private-attachment-read-sentinel");
    failAttachmentRead = false;
    const legacyId = randomUUID();
    expect((await createAdmin(env).from("ketik_history").insert({ id: legacyId, user_id: trainer.userId, scenario_title: "Legacy", consumer_name: "Konsumen", messages: [{ id: "legacy-image", sender: "consumer", text: "[SEND_IMAGE:0]" }] })).error).toBeNull();
    const legacy = (await (await api(trainer, `/history/${legacyId}`)).json()).data;
    expect(legacy.attachments).toEqual([]);
    await test.info().attach("attachment-history-contract", { body: JSON.stringify({ id: session.id, sentIndexes: [0, 2, 9], returnedIndexes: [0], legacyAttachments: legacy.attachments }), contentType: "application/json" });
  } finally {
    failAttachmentRead = false;
    providerText = "Tagihan saya ganda.[BREAK]Mohon dibantu.";
    const current = await api(trainer, "/settings");
    expect((await api(trainer, "/settings", "PUT", original, { "x-settings-version": current.headers.get("x-settings-version")! })).status).toBe(200);
  }
});

test("snapshot survives settings changes", async () => {
  const active = await start();
  const source = await api(trainer, "/settings");
  const body = (await source.json()).data;
  const changed = {
    ...body,
    selectedModel: "gemini-3.8-flash",
    simulationDuration: 10,
    identitySettings: { ...body.identitySettings, displayName: "Changed" },
  };
  expect(
    (
      await api(trainer, "/settings", "PUT", changed, {
        "x-settings-version": source.headers.get("x-settings-version")!,
      })
    ).status,
  ).toBe(200);
  const loaded = (await (await api(trainer, `/sessions/${active.id}`)).json())
    .data;
  expect(loaded.config).toEqual(active.config);
  expect(loaded.expiresAt).toBe(active.expiresAt);
  const latest = await api(trainer, "/settings");
  expect(
    (
      await api(trainer, "/settings", "PUT", body, {
        "x-settings-version": latest.headers.get("x-settings-version")!,
      })
    ).status,
  ).toBe(200);
});

test("concurrent turns are serialized and a reclaimed lease fences the old provider response", async () => {
  const active = await start();
  const body = {
    requestId: randomUUID(),
    expectedVersion: 0,
    text: "Pesan bersamaan",
  };
  let release!: () => void;
  let enter!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  providerGate = async () => {
    enter();
    await gate;
  };
  const old = api(trainer, `/sessions/${active.id}/turns`, "POST", body);
  try {
    await entered;
    expect(
      (await api(trainer, `/sessions/${active.id}/turns`, "POST", body)).status,
    ).toBe(409);
    expect(
      (
        await api(trainer, `/sessions/${active.id}/turns`, "POST", {
          ...body,
          requestId: randomUUID(),
          expectedVersion: 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (await api(trainer, `/sessions/${active.id}/finish`, "POST", {})).status,
    ).toBe(409);
    expect(
      (
        await createAdmin(env)
          .from("ketik_session_turns")
          .update({
            lease_expires_at: new Date(Date.now() - 1000).toISOString(),
          })
          .eq("session_id", active.id)
      ).error,
    ).toBeNull();
    providerGate = null;
    const retried = await api(
      trainer,
      `/sessions/${active.id}/turns`,
      "POST",
      body,
    );
    expect(retried.status).toBe(200);
    release();
    expect((await old).status).toBe(409);
    const loaded = (await (await api(trainer, `/sessions/${active.id}`)).json())
      .data;
    expect(
      loaded.messages.filter((m: { sender: string }) => m.sender === "agent"),
    ).toHaveLength(1);
    expect(
      loaded.messages.filter(
        (m: { sender: string }) => m.sender === "consumer",
      ),
    ).toHaveLength(2);
    expect(loaded.pendingTurn).toBeNull();
  } finally {
    providerGate = null;
    release();
    await old;
  }
});

test("JWTs only read own operational rows and cannot mutate or execute session RPCs", async () => {
  const active = await start();
  expect(
    (
      await api(trainer, `/sessions/${active.id}/turns`, "POST", {
        requestId: randomUUID(),
        expectedVersion: 0,
        text: "Pesan untuk RLS",
      })
    ).status,
  ).toBe(200);
  for (const identity of [trainer, agent]) {
    const client = createClient(env.apiUrl, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${identity.token}` } },
    });
    const read = await client
      .from("ketik_sessions")
      .select("id")
      .eq("id", active.id);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(identity === trainer ? 1 : 0);
    const turnRead = await client
      .from("ketik_session_turns")
      .select("request_id")
      .eq("session_id", active.id);
    expect(turnRead.error).toBeNull();
    expect(turnRead.data).toHaveLength(identity === trainer ? 1 : 0);
    expect(
      (
        await client.from("ketik_sessions").insert({
          user_id: identity.userId,
          start_request_id: randomUUID(),
          snapshot: {},
          expires_at: new Date().toISOString(),
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await client
          .from("ketik_sessions")
          .update({ version: 99 })
          .eq("id", active.id)
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await client.from("ketik_session_turns").insert({
          session_id: active.id,
          request_id: randomUUID(),
          expected_version: 0,
          agent_text: "Forged",
          status: "completed",
        })
      ).error?.code,
    ).toBe("42501");
    for (const [name, params] of [
      [
        "start_ketik_session",
        {
          p_user_id: identity.userId,
          p_request_id: randomUUID(),
          p_snapshot: {},
          p_settings_version: "absent",
          p_assignment_version: null,
        },
      ],
      [
        "claim_ketik_session_turn",
        {
          p_user_id: identity.userId,
          p_session_id: active.id,
          p_request_id: randomUUID(),
          p_expected_version: 0,
          p_text: "Forged",
          p_lease_seconds: 30,
        },
      ],
      [
        "publish_ketik_session_turn",
        {
          p_user_id: identity.userId,
          p_session_id: active.id,
          p_request_id: randomUUID(),
          p_lease: randomUUID(),
          p_messages: [],
          p_closed: false,
        },
      ],
      [
        "finish_ketik_session",
        { p_user_id: identity.userId, p_session_id: active.id },
      ],
    ] as const)
      expect((await client.rpc(name, params)).error?.code).toBe("42501");
  }
});

test("failed finalization preserves the active transcript and retry publishes exactly one history row", async () => {
  const active = await start();
  const turned = await api(trainer, `/sessions/${active.id}/turns`, "POST", {
    requestId: randomUUID(),
    expectedVersion: 0,
    text: "Simpan secara atomik",
  });
  expect(turned.status).toBe(200);
  const messages = (await turned.json()).data.messages;
  fixtureSql(`CREATE FUNCTION public.${triggerName}() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$ BEGIN RAISE EXCEPTION '${marker}'; END; $$;
 REVOKE ALL ON FUNCTION public.${triggerName}() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.${triggerName}() TO service_role;
 CREATE TRIGGER ${triggerName} BEFORE INSERT ON public.ketik_history FOR EACH ROW WHEN (NEW.id='${active.id}'::uuid) EXECUTE FUNCTION public.${triggerName}();`);
  try {
    const failed = await api(
      trainer,
      `/sessions/${active.id}/finish`,
      "POST",
      {},
    );
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain(marker);
    const row = await createAdmin(env)
      .from("ketik_sessions")
      .select("state,messages")
      .eq("id", active.id)
      .single();
    expect(row.data).toEqual({ state: "active", messages });
  } finally {
    fixtureSql(`DROP FUNCTION public.${triggerName}() CASCADE;`);
  }
  for (let i = 0; i < 2; i++)
    expect(
      (await api(trainer, `/sessions/${active.id}/finish`, "POST", {})).status,
    ).toBe(200);
  const history = await createAdmin(env)
    .from("ketik_history")
    .select("messages")
    .eq("id", active.id);
  expect(history.data).toEqual([{ messages }]);
  expect((await api(trainer, `/history/${active.id}`, "DELETE")).status).toBe(
    200,
  );
  expect((await api(trainer, `/sessions/${active.id}`)).status).toBe(404);
  const turns = await createAdmin(env)
    .from("ketik_session_turns")
    .select("request_id")
    .eq("session_id", active.id);
  expect(turns.error).toBeNull();
  expect(turns.data).toEqual([]);
});

test("server-picked and custom consumer identities carry the gender used for the portrait", async () => {
  const source = await api(trainer, "/settings");
  const body = (await source.json()).data;
  const put = async (displayName: string) => {
    const latest = await api(trainer, "/settings");
    const saved = await api(
      trainer,
      "/settings",
      "PUT",
      { ...body, identitySettings: { ...body.identitySettings, displayName } },
      { "x-settings-version": latest.headers.get("x-settings-version")! },
    );
    expect(saved.status).toBe(200);
  };
  try {
    await put("");
    for (let i = 0; i < 4; i++) {
      const { name, gender } = (await start()).config.identity;
      expect(KETIK_DUMMY_CONSUMERS).toContainEqual({ name, gender });
    }
    await put("Pak Hendra");
    expect((await start()).config.identity).toMatchObject({
      name: "Pak Hendra",
      gender: "male",
    });
    await put("Konsumen server");
    expect((await start()).config.identity.gender).toBeUndefined();
  } finally {
    await put(body.identitySettings.displayName);
  }
});
