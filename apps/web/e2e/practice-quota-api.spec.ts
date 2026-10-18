import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Hono } from "hono";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

// Real local Supabase + production API app: daily practice limits counted on
// the server, and the Telefun call-server gate. Plan:
// plans/markdown/kontrol-user-fase-2.md.

test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const ns = `quota-${randomUUID().slice(0, 8)}`;
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
const users: Record<
  "trainer" | "agent" | "unassigned" | "suspended",
  Identity
> = {} as never;
let app: Hono;
let guardedFetch: typeof fetch;
let failProvider = false;

const scenario = {
  id: ns,
  category: "Pinjaman",
  title: "Tagihan setelah lunas",
  description: "Konsumen sudah melunasi pinjaman tetapi masih ditagih.",
  isActive: true,
  primaryRecipientType: "reported_company" as const,
  recipientMode: "single" as const,
  recipientEmails: [`pengaduan-${ns}@company.test`],
  expectedAnswer: "Tagihan dibatalkan.",
  alwaysUseSampleEmail: true,
  sampleEmailTemplate: { subject: ns, body: "Mohon periksa tagihan saya." },
};
const consumer = { id: "calm", name: "Tenang", description: "Tenang" };
const identity = {
  name: "Budi",
  bodyName: "Budi",
  city: "Bandung",
  email: `consumer-${ns}@mail.test`,
};
const generation = (overrides: Record<string, unknown> = {}) => ({
  client_request_id: randomUUID(),
  scenarioDraft: scenario,
  consumerTypeId: consumer.id,
  consumerTypeDraft: consumer,
  identity,
  selectedModel: "gemini-3.8-flash",
  enableImageGeneration: false,
  ...overrides,
});

async function api(
  who: Identity,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const response = await tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${who.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

function client(who: Identity) {
  return createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${who.token}` } },
  });
}

const used = (who: Identity, module: string) =>
  Number(
    runSql(
      env,
      `SELECT count(*) FROM practice_usage
       WHERE user_id='${who.userId}' AND module='${module}' AND refunded_at IS NULL;`,
    ),
  );

function expectLimitReached(
  response: {
    status: number;
    body: { error?: { code: string; message: string } };
  },
  module: string,
) {
  expect(response.status, JSON.stringify(response.body)).toBe(429);
  expect(response.body.error?.code).toBe("PRACTICE_LIMIT_REACHED");
  expect(response.body.error?.message).toContain(module);
  expect(response.body.error?.message).toContain("00.00 WIB");
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_URL: env.apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).hostname === "generativelanguage.googleapis.com") {
      if (failProvider)
        return Response.json({ error: { message: "e2e" } }, { status: 500 });
      return Response.json({
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  text: JSON.stringify({
                    subject: ns,
                    body: "Mohon periksa tagihan saya.",
                  }),
                },
              ],
            },
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
    return guardedFetch(request);
  };
  users.trainer = await createUserWithJwt(env, "trainer", ns);
  users.agent = await createUserWithJwt(env, "agent", ns);
  users.unassigned = await createUserWithJwt(env, "agent", `${ns}-free`);
  users.suspended = await createUserWithJwt(env, "trainer", `${ns}-off`);
  app = (await import("../../api/src/app")).default as unknown as Hono;

  // The agent needs a KETIK assignment from the trainer before it can start.
  const saved = await api(users.trainer, "/ketik/settings", "PUT", {
    ...DEFAULT_KETIK_SETTINGS,
    selectedModel: "gpt-5.4-mini",
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const source = await tnaApiRequest(
    app,
    "http://localhost/api/v1/ketik/settings",
    { headers: { Authorization: `Bearer ${users.trainer.token}` } },
  );
  const target = await api(
    users.trainer,
    `/ketik/assignments/${users.agent.userId}`,
  );
  const assigned = await api(
    users.trainer,
    `/ketik/assignments/${users.agent.userId}`,
    "PUT",
    {
      sourceSettingsVersion: source.headers.get("x-settings-version"),
      recipientSettingsVersion: target.body.data.recipientSettingsVersion,
      expectedAssignmentVersion: target.body.data.assignment?.version ?? null,
    },
  );
  expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
});

test.afterAll(async () => {
  globalThis.fetch = guardedFetch;
  const admin = createAdmin(env);
  for (const who of Object.values(users)) {
    await admin.from("pdkt_mailbox_items").delete().eq("user_id", who.userId);
    await admin.from("pdkt_history").delete().eq("user_id", who.userId);
    await admin.from("ai_usage_logs").delete().eq("user_id", who.userId);
    await admin.auth.admin.deleteUser(who.userId);
  }
});

test("KETIK: three starts a day for an agent, a retry counts once, trainers are unlimited", async () => {
  const start = (who: Identity, requestId: string) =>
    api(who, "/ketik/sessions", "POST", {
      requestId,
      simulationSubject: { type: "self" },
    });
  const first = randomUUID();
  for (const requestId of [first, randomUUID(), randomUUID()]) {
    const response = await start(users.agent, requestId);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
  }
  expect((await start(users.agent, first)).status).toBe(200);
  expect(used(users.agent, "ketik")).toBe(3);
  expectLimitReached(await start(users.agent, randomUUID()), "KETIK");
  expect(used(users.agent, "ketik")).toBe(3);

  // A start refused for another reason never uses the quota.
  const unassigned = await start(users.unassigned, randomUUID());
  expect(unassigned.body.error.code).toBe("ASSIGNMENT_REQUIRED");
  expect(used(users.unassigned, "ketik")).toBe(0);

  for (let i = 0; i < 4; i++)
    expect((await start(users.trainer, randomUUID())).status).toBe(200);
});

test("PDKT: each new email counts, replies are free, a failed generation is refunded", async () => {
  const agent = users.unassigned;
  const created: string[] = [];
  for (let i = 0; i < 3; i++) {
    const response = await api(
      agent,
      "/pdkt/session/create",
      "POST",
      generation(),
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    created.push(response.body.data.id);
  }
  expect(used(agent, "pdkt")).toBe(3);
  expectLimitReached(
    await api(agent, "/pdkt/session/create", "POST", generation()),
    "PDKT",
  );
  // The unused generator and the plain save count like a new email too.
  expectLimitReached(
    await api(agent, "/pdkt/session/init", "POST", generation()),
    "PDKT",
  );

  // All three emails can still be answered.
  for (const mailboxId of created) {
    const reply = await api(agent, "/pdkt/mailbox/reply", "POST", {
      mailboxId,
      timeTaken: 60,
      reply: {
        id: `${mailboxId}-reply`,
        from: "agent@mail.test",
        to: identity.email,
        subject: `Re: ${ns}`,
        body: "Yth. Bapak Budi, kami memeriksa tagihan Anda.",
        timestamp: new Date().toISOString(),
        isAgent: true,
      },
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
  }
  expect(used(agent, "pdkt")).toBe(3);

  // AI failure gives the quota back.
  const trainerBefore = used(users.trainer, "pdkt");
  failProvider = true;
  const failed = await api(
    users.trainer,
    "/pdkt/session/create",
    "POST",
    generation({
      scenarioDraft: { ...scenario, alwaysUseSampleEmail: false },
    }),
  );
  failProvider = false;
  expect(failed.status).toBe(502);
  expect(used(users.trainer, "pdkt")).toBe(trainerBefore);
});

test("PDKT: an email slipped in through the database counts when it is answered", async () => {
  const agent = users.agent;
  const { data: mailboxId, error } = await client(agent).rpc(
    "submit_pdkt_mailbox_batch",
    {
      p_client_request_id: randomUUID(),
      p_sender_name: identity.name,
      p_sender_email: identity.email,
      p_subject: ns,
      p_snippet: "Mohon periksa tagihan saya.",
      p_scenario_snapshot: scenario,
      p_config_snapshot: {
        scenarios: [scenario],
        consumerType: consumer,
        identity,
      },
      p_inbound_email: {
        id: ns,
        from: identity.email,
        to: scenario.recipientEmails[0],
        subject: ns,
        body: "Mohon periksa tagihan saya.",
        timestamp: new Date().toISOString(),
        isAgent: false,
      },
    },
  );
  expect(error).toBeNull();
  const reply = (body: string) =>
    api(agent, "/pdkt/mailbox/reply", "POST", {
      mailboxId,
      timeTaken: 60,
      reply: {
        id: `${mailboxId}-reply`,
        from: "agent@mail.test",
        to: identity.email,
        subject: `Re: ${ns}`,
        body,
        timestamp: new Date().toISOString(),
        isAgent: true,
      },
    });
  const response = await reply("Yth. Bapak Budi, kami memeriksa tagihan Anda.");
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(used(agent, "pdkt")).toBe(1);
});

test("Telefun: zero means not allowed, an override opens it, trainers are unlimited", async () => {
  const start = (who: Identity) =>
    api(who, "/telefun/sessions", "POST", {
      scenario_title: ns,
      consumer_name: "Budi",
    });
  for (let i = 0; i < 2; i++) {
    const response = await start(users.trainer);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(
      runSql(
        env,
        `SELECT count(*) FROM practice_usage WHERE module='telefun' AND request_key='${response.body.data.id}';`,
      ),
    ).toBe("1");
  }

  // A per-user override wins over the role rule.
  runSql(
    env,
    `INSERT INTO practice_limit_overrides(user_id,module,daily_limit,ends_on)
     VALUES ('${users.trainer.userId}','telefun',2,(now() AT TIME ZONE 'Asia/Jakarta')::date);`,
  );
  expectLimitReached(await start(users.trainer), "Telefun");
  runSql(
    env,
    `UPDATE practice_limit_overrides SET ends_on=(now() AT TIME ZONE 'Asia/Jakarta')::date - 1
     WHERE user_id='${users.trainer.userId}';`,
  );
  expect((await start(users.trainer)).status).toBe(200);

  // A role with zero gets a plain refusal, not a countdown.
  runSql(
    env,
    `INSERT INTO practice_limit_overrides(user_id,module,daily_limit)
     VALUES ('${users.suspended.userId}','telefun',0);`,
  );
  const blocked = await start(users.suspended);
  expect(blocked.status).toBe(403);
  expect(blocked.body.error.code).toBe("PRACTICE_NOT_ALLOWED");
  expect(blocked.body.error.message).toContain("Telefun");
});

test("the browser cannot write quota data or Telefun sessions directly", async () => {
  const agent = client(users.agent);
  expect((await agent.from("practice_usage").select("id")).error?.code).toBe(
    "42501",
  );
  expect(
    (
      await agent.from("practice_limit_overrides").insert({
        user_id: users.agent.userId,
        module: "ketik",
        daily_limit: null,
      })
    ).error?.code,
  ).toBe("42501");
  expect(
    (
      await agent.rpc("consume_practice_quota", {
        p_user_id: users.agent.userId,
        p_module: "ketik",
        p_request_key: "x",
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await agent.rpc("refund_practice_quota", {
        p_user_id: users.agent.userId,
        p_module: "ketik",
        p_request_key: "x",
      })
    ).error,
  ).not.toBeNull();

  const inserted = await agent.from("telefun_history").insert({
    user_id: users.agent.userId,
    scenario_title: ns,
    consumer_name: "Budi",
    status: "active",
  });
  expect(inserted.error?.code).toBe("42501");

  const trainerSession = (
    await createAdmin(env)
      .from("telefun_history")
      .select("id")
      .eq("user_id", users.trainer.userId)
      .limit(1)
      .single()
  ).data!.id;
  const updated = await client(users.trainer)
    .from("telefun_history")
    .update({ status: "active", created_at: new Date().toISOString() })
    .eq("id", trainerSession)
    .select("id");
  expect(updated.data ?? []).toEqual([]);
});

test("the Telefun call server only admits a fresh, active session made by the API", async () => {
  const { TelefunAuthGate } = await import("../../telefun/src/server-auth");
  const { verifyToken } = await import("../../telefun/src/auth");
  const { getOwnedSessionId } = await import("../../telefun/src/db");
  const gate = () =>
    new TelefunAuthGate({
      verifyToken,
      getOwnedSessionId,
    } as unknown as ConstructorParameters<typeof TelefunAuthGate>[0]);
  const authenticate = (who: Identity, sessionId?: string) =>
    gate().authenticate({
      type: "authenticate",
      token: who.token,
      ...(sessionId ? { sessionId } : {}),
    });
  const fresh = await api(users.trainer, "/telefun/sessions", "POST", {
    scenario_title: ns,
    consumer_name: "Budi",
  });
  expect(fresh.status, JSON.stringify(fresh.body)).toBe(200);
  const sessionId = fresh.body.data.id as string;

  expect(await authenticate(users.trainer, sessionId)).toMatchObject({
    ok: true,
    sessionId,
  });
  // No session id: the legacy "make one for me" path is gone.
  expect(await authenticate(users.trainer)).toMatchObject({
    ok: false,
    reason: "Invalid Session",
  });
  // Someone else's session.
  expect(await authenticate(users.agent, sessionId)).toMatchObject({
    ok: false,
    reason: "Invalid Session",
  });

  const admin = createAdmin(env);
  // A finished call cannot be reused.
  await admin
    .from("telefun_history")
    .update({ status: "completed" })
    .eq("id", sessionId);
  expect(await authenticate(users.trainer, sessionId)).toMatchObject({
    ok: false,
    reason: "Invalid Session",
  });
  // A stale session cannot be reused the next day.
  await admin
    .from("telefun_history")
    .update({
      status: "active",
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    .eq("id", sessionId);
  expect(await authenticate(users.trainer, sessionId)).toMatchObject({
    ok: false,
    reason: "Invalid Session",
  });
  // A suspended account cannot start a call it created earlier.
  const own = await admin
    .from("telefun_history")
    .insert({
      user_id: users.suspended.userId,
      scenario_title: ns,
      consumer_name: "Budi",
      status: "active",
    })
    .select("id")
    .single();
  await admin
    .from("profiles")
    .update({ status: "inactive" })
    .eq("id", users.suspended.userId);
  expect(await authenticate(users.suspended, own.data!.id)).toMatchObject({
    ok: false,
    reason: "Invalid Session",
  });
});
