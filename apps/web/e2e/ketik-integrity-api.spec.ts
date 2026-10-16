import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Hono } from "hono";
import {
  DEFAULT_KETIK_SETTINGS,
  type SimulationSubjectSelection,
} from "@trainers/types";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

// Real JWT + PostgREST/RLS + production Hono routes, loopback only.
// Apply the migration externally; this spec must also fail on the old policy.
test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const ns = `ketik-integrity-${randomUUID().slice(0, 8)}`;
const roles = ["agent", "leader", "trainer", "admin"] as const;
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
const users = new Map<(typeof roles)[number], Identity>();
let participantId: string | undefined;
let app: Hono;
let guardedFetch: typeof fetch;

function userClient(identity: Identity) {
  return createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${identity.token}` } },
  });
}

async function api(
  identity: Identity,
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  return tnaApiRequest(app, `http://localhost/api/v1/ketik${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${identity.token}`,
      "Content-Type": "application/json",
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
    if (url.hostname === "api.openai.com" && url.pathname === "/v1/responses")
      return Response.json({
        id: ns,
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Mohon bantuan." }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      });
    return guardedFetch(input, init);
  };
  for (const role of roles)
    users.set(role, await createUserWithJwt(env, role, ns));
  const folder = await createAdmin(env)
    .from("profiler_folders")
    .insert({ name: ns });
  expect(folder.error).toBeNull();
  const participant = await createAdmin(env)
    .from("profiler_peserta")
    .insert({
      batch_name: ns,
      nama: ns,
      tim: "Chat",
      jabatan: "Agent",
      nomor_urut: 1,
    })
    .select("id")
    .single();
  expect(participant.error).toBeNull();
  participantId = participant.data!.id;
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
  const source = users.get("trainer")!;
  expect(
    (
      await api(
        source,
        "/settings",
        { ...DEFAULT_KETIK_SETTINGS, selectedModel: "gpt-5.4-mini" },
        "PUT",
      )
    ).status,
  ).toBe(200);
  for (const role of ["agent", "leader"] as const) {
    const recipient = users.get(role)!;
    const settings = await api(source, "/settings");
    const snapshot = (
      await (await api(source, `/assignments/${recipient.userId}`)).json()
    ).data;
    expect(
      (
        await api(
          source,
          `/assignments/${recipient.userId}`,
          {
            sourceSettingsVersion: settings.headers.get("x-settings-version"),
            recipientSettingsVersion: snapshot.recipientSettingsVersion,
            expectedAssignmentVersion: null,
          },
          "PUT",
        )
      ).status,
    ).toBe(200);
  }
});
async function finishChat(
  identity: Identity,
  simulationSubject: SimulationSubjectSelection = { type: "self" },
) {
  const requestId = randomUUID();
  const started = await api(identity, "/sessions", {
    requestId,
    simulationSubject,
  });
  expect(started.status).toBe(200);
  const active = (await started.json()).data;
  if (simulationSubject.type === "participant")
    expect(
      (
        await api(identity, "/sessions", {
          requestId,
          simulationSubject: { type: "self" },
        })
      ).status,
    ).toBe(409);
  expect(
    (
      await api(identity, `/sessions/${active.id}/turns`, {
        requestId: randomUUID(),
        expectedVersion: 0,
        text: "Baik, saya bantu.",
      })
    ).status,
  ).toBe(200);
  return api(identity, `/sessions/${active.id}/finish`, {});
}

test.afterAll(async () => {
  globalThis.fetch = guardedFetch;
  const admin = createAdmin(env);
  for (const identity of users.values()) {
    expect(
      (
        await admin
          .from("ai_usage_logs")
          .delete()
          .eq("user_id", identity.userId)
      ).error,
    ).toBeNull();
    // Users own the fixtures, including any forged row created in a RED run.
    const results = await admin
      .from("results")
      .delete()
      .eq("user_id", identity.userId);
    // Some supported local baselines have no legacy results table.
    if (results.error?.code !== "PGRST205") expect(results.error).toBeNull();
    const deleted = await admin.auth.admin.deleteUser(identity.userId);
    expect(deleted.error).toBeNull();
  }
  if (participantId) {
    const deleted = await admin
      .from("profiler_peserta")
      .delete()
      .eq("id", participantId);
    expect(deleted.error).toBeNull();
  }
  const folder = await admin.from("profiler_folders").delete().eq("name", ns);
  expect(folder.error).toBeNull();
});

test("direct authenticated score/status INSERT is denied for every application role", async () => {
  for (const role of roles) {
    const identity = users.get(role)!;
    const id = randomUUID();
    const inserted = await userClient(identity).from("ketik_history").insert({
      id,
      user_id: identity.userId,
      scenario_title: ns,
      consumer_name: "Konsumen E2E",
      final_score: 100,
      empathy_score: 100,
      review_status: "completed",
      messages: [],
    });
    expect(
      inserted.error?.code,
      `${role}: RLS must reject direct insertion`,
    ).toBe("42501");
    const stored = await createAdmin(env)
      .from("ketik_history")
      .select("id")
      .eq("id", id);
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual([]);
  }
});

test("backend saves self sessions without trusting submitted scores and preserves owner-only reads", async () => {
  const owner = users.get("agent")!;
  expect(
    (
      await api(owner, "/sessions", {
        requestId: randomUUID(),
        finalScore: 100,
        reviewStatus: "completed",
      })
    ).status,
  ).toBe(400);
  const response = await finishChat(owner);
  expect(response.status).toBe(200);
  const { data: session } = await response.json();
  expect(session.simulationSubject).toMatchObject({
    type: "self",
    displayName: "E2E agent",
  });
  expect(session.reviewStatus).toBe("pending");
  const own = await userClient(owner)
    .from("ketik_history")
    .select("id, final_score, review_status")
    .eq("id", session.id);
  expect(own.error).toBeNull();
  expect(own.data).toEqual([
    { id: session.id, final_score: null, review_status: "pending" },
  ]);
  const other = await userClient(users.get("trainer")!)
    .from("ketik_history")
    .select("id")
    .eq("id", session.id);
  expect(other.error).toBeNull();
  expect(other.data).toEqual([]);
  const history = await api(users.get("trainer")!, "/history");
  expect(history.status).toBe(200);
  expect((await history.json()).data.items).toEqual([]);

  const modified = await userClient(owner)
    .from("ketik_history")
    .update({ final_score: 100, review_status: "completed" })
    .eq("id", session.id)
    .select("id");
  expect(modified.data).toEqual([]);
  const unchanged = await createAdmin(env)
    .from("ketik_history")
    .select("final_score, review_status")
    .eq("id", session.id)
    .single();
  expect(unchanged.data).toEqual({
    final_score: null,
    review_status: "pending",
  });
});

test("participant attribution remains trainer-only and server-resolved", async () => {
  const selection = { type: "participant", participantId };
  const denied = await api(users.get("agent")!, "/sessions", {
    requestId: randomUUID(),
    simulationSubject: selection,
  });
  expect(denied.status).toBe(403);
  const allowed = await finishChat(users.get("trainer")!, {
    type: "participant",
    participantId: participantId!,
  });
  expect(allowed.status).toBe(200);
  const { data: session } = await allowed.json();
  expect(session.simulationSubject).toMatchObject({
    type: "participant",
    participantId,
    displayName: ns,
    team: "Chat",
  });
  const stored = await createAdmin(env)
    .from("ketik_history")
    .select(
      "user_id, simulation_subject_peserta_id, simulation_subject_name, review_status, final_score",
    )
    .eq("id", session.id)
    .single();
  expect(stored.error).toBeNull();
  expect(stored.data).toEqual({
    user_id: users.get("trainer")!.userId,
    simulation_subject_peserta_id: participantId,
    simulation_subject_name: ns,
    review_status: "pending",
    final_score: null,
  });
});
