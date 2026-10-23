import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const ns = randomUUID();
const batch = `Replier ${ns}`;
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
const actors: Partial<
  Record<"trainer" | "admin" | "agent" | "leader", Identity>
> = {};
let app: Hono;
let creatorId: string;
let replierId: string;
const mailboxIds: string[] = [];
const historyIds: string[] = [];

const scenario = {
  id: ns,
  title: "Tagihan ganda",
  category: "Transaksi",
  description: "Tagihan ganda",
  isActive: true,
};
const inbound = {
  id: ns,
  from: "rina@local.test",
  to: "ojk@kontak157.go.id",
  subject: scenario.title,
  body: "Mohon periksa tagihan ganda saya.",
  timestamp: new Date().toISOString(),
  isAgent: false,
};
const reply = {
  ...inbound,
  id: `reply-${ns}`,
  from: inbound.to,
  to: inbound.from,
  body: "Terima kasih. Kami akan memeriksa tagihan Ibu.",
  isAgent: true,
};

function api(actor: Identity, path: string, body?: unknown) {
  return tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${actor.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function userClient(actor?: Identity) {
  return createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(actor
      ? { global: { headers: { Authorization: `Bearer ${actor.token}` } } }
      : {}),
  });
}
async function mailbox() {
  const response = await api(actors.trainer!, "/pdkt/mailbox/batch", {
    client_request_id: randomUUID(),
    sender_name: "Rina",
    sender_email: inbound.from,
    subject: inbound.subject,
    snippet: inbound.body,
    scenario_snapshot: scenario,
    config_snapshot: {
      scenarios: [scenario],
      consumerType: { id: "calm", name: "Tenang", description: "Tenang" },
      identity: {
        name: "Rina",
        bodyName: "Rina",
        email: inbound.from,
        city: "Bandung",
      },
      enableImageGeneration: false,
      selectedModel: "gemini-3.8-flash",
    },
    inbound_email: inbound,
    simulationSubject: { type: "participant", participantId: creatorId },
  });
  expect(response.status).toBe(200);
  const id = (await response.json()).data as string;
  expect(id).toBeTruthy();
  mailboxIds.push(id);
  return id;
}
async function waitEvaluation(id: string) {
  await expect
    .poll(
      async () =>
        (
          await createAdmin(env)
            .from("pdkt_history")
            .select("evaluation_status")
            .eq("id", id)
            .single()
        ).data?.evaluation_status,
      { timeout: 45000 },
    )
    .toBe("failed");
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
  for (const role of ["trainer", "admin", "agent", "leader"] as const)
    actors[role] = await createUserWithJwt(env, role, ns);
  const db = createAdmin(env);
  expect(
    (await db.from("profiler_folders").insert({ name: batch })).error,
  ).toBeNull();
  for (const name of ["Creator", "Replier"]) {
    const row = await db
      .from("profiler_peserta")
      .insert({
        nama: `${name} ${ns}`,
        batch_name: batch,
        tim: "Tim Email",
        jabatan: "Agent",
      })
      .select("id")
      .single();
    expect(row.error).toBeNull();
    if (name === "Creator") creatorId = row.data!.id;
    else replierId = row.data!.id;
  }
  app = (await import("../../api/src/app")).default as unknown as Hono;
  expect((await import("../../api/src/lib/env")).env.VITE_SUPABASE_URL).toBe(
    env.apiUrl,
  );
});

test.afterAll(async () => {
  const db = createAdmin(env);
  if (mailboxIds.length)
    expect(
      (await db.from("pdkt_mailbox_items").delete().in("id", mailboxIds)).error,
    ).toBeNull();
  if (historyIds.length)
    expect(
      (await db.from("pdkt_history").delete().in("id", historyIds)).error,
    ).toBeNull();
  expect(
    (await db.from("profiler_peserta").delete().eq("batch_name", batch)).error,
  ).toBeNull();
  expect(
    (await db.from("profiler_folders").delete().eq("name", batch)).error,
  ).toBeNull();
  for (const actor of Object.values(actors))
    expect((await db.auth.admin.deleteUser(actor.userId)).error).toBeNull();
});

test("reply selection denies unauthorized, malformed and missing participants before mutation", async () => {
  const mailboxId = await mailbox();
  const request = {
    mailboxId,
    reply,
    timeTaken: 30,
    simulationSubject: { type: "participant", participantId: replierId },
  };
  for (const role of ["agent", "leader"] as const) {
    const response = await api(actors[role]!, "/pdkt/mailbox/reply", request);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toEqual({
      code: "FORBIDDEN",
      message: "Hanya admin/trainer yang dapat memilih peserta.",
    });
  }
  const missing = await api(actors.trainer!, "/pdkt/mailbox/reply", {
    ...request,
    simulationSubject: { type: "participant", participantId: randomUUID() },
  });
  expect(missing.status).toBe(404);
  expect((await missing.json()).error).toEqual({
    code: "NOT_FOUND",
    message: "Peserta tidak ditemukan.",
  });
  const malformed = await api(actors.trainer!, "/pdkt/mailbox/reply", {
    ...request,
    simulationSubject: { type: "participant", participantId: "not-a-uuid" },
  });
  expect(malformed.status).toBe(400);
  const invalidToken = await api(
    { ...actors.trainer!, token: "invalid" },
    "/pdkt/mailbox/reply",
    request,
  );
  expect(invalidToken.status).toBe(401);
  const untouched = await createAdmin(env)
    .from("pdkt_mailbox_items")
    .select("status,history_id,simulation_subject_peserta_id")
    .eq("id", mailboxId)
    .single();
  expect(untouched.error).toBeNull();
  expect(untouched.data).toEqual({
    status: "open",
    history_id: null,
    simulation_subject_peserta_id: creatorId,
  });

  const params = {
    p_mailbox_id: mailboxId,
    p_agent_reply: reply,
    p_time_taken: 30,
    p_subject_type: "participant",
    p_subject_peserta_id: replierId,
  };
  expect(
    (await userClient().rpc("submit_pdkt_mailbox_reply_with_subject", params))
      .error?.code,
  ).toBe("42501");
  for (const role of ["agent", "leader"] as const)
    expect(
      (
        await userClient(actors[role]).rpc(
          "submit_pdkt_mailbox_reply_with_subject",
          params,
        )
      ).error?.message,
    ).toContain("admin/trainer");
  expect(
    (
      await userClient(actors.trainer).rpc(
        "submit_pdkt_mailbox_reply_with_subject",
        { ...params, p_subject_peserta_id: randomUUID() },
      )
    ).error?.message,
  ).toContain("peserta tidak ditemukan");
  for (const changes of [
    { p_subject_type: "self" },
    { p_subject_type: null },
    { p_subject_peserta_id: null },
  ])
    expect(
      (
        await userClient(actors.trainer).rpc(
          "submit_pdkt_mailbox_reply_with_subject",
          { ...params, ...changes },
        )
      ).error?.message,
    ).toContain("VALIDATION_ERROR");
  const db = createAdmin(env);
  expect(
    (
      await db
        .from("profiles")
        .update({ status: "inactive" })
        .eq("id", actors.trainer!.userId)
    ).error,
  ).toBeNull();
  try {
    expect(
      (
        await userClient(actors.trainer).rpc(
          "submit_pdkt_mailbox_reply_with_subject",
          params,
        )
      ).error?.code,
    ).toBe("42501");
  } finally {
    expect(
      (
        await db
          .from("profiles")
          .update({ status: "active" })
          .eq("id", actors.trainer!.userId)
      ).error,
    ).toBeNull();
  }
  const finalState = await db
    .from("pdkt_mailbox_items")
    .select("status,history_id")
    .eq("id", mailboxId)
    .single();
  expect(finalState.error).toBeNull();
  expect(finalState.data).toEqual({ status: "open", history_id: null });
});

test("trainer and admin reply attribution is canonical across retries without changing creator metadata", async () => {
  for (const role of ["trainer", "admin"] as const) {
    const mailboxId = await mailbox();
    const response = await api(actors[role]!, "/pdkt/mailbox/reply", {
      mailboxId,
      reply,
      timeTaken: 30,
      simulationSubject: { type: "participant", participantId: replierId },
      simulationSubjectSnapshot: { displayName: "Forged" },
    });
    expect(response.status).toBe(200);
    const historyId = (await response.json()).data.historyId as string;
    historyIds.push(historyId);
    await waitEvaluation(historyId);
    const retry = await userClient(actors.admin).rpc(
      "submit_pdkt_mailbox_reply_with_subject",
      {
        p_mailbox_id: mailboxId,
        p_agent_reply: { ...reply, body: "Ignored retry" },
        p_time_taken: 300,
        p_subject_type: "participant",
        p_subject_peserta_id: creatorId,
      },
    );
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual({ history_id: historyId, created: false });
    const history = await createAdmin(env)
      .from("pdkt_history")
      .select(
        "user_id,simulation_subject_peserta_id,simulation_subject_name,time_taken,emails",
      )
      .eq("id", historyId)
      .single();
    expect(history.error).toBeNull();
    expect(history.data).toMatchObject({
      user_id: actors[role]!.userId,
      simulation_subject_peserta_id: replierId,
      simulation_subject_name: `Replier ${ns}`,
      time_taken: 30,
    });
    expect(history.data!.emails.at(-1).body).toBe(reply.body);
    const evaluationBefore = await createAdmin(env)
      .from("pdkt_history")
      .select("evaluation_status,evaluation_completed_at")
      .eq("id", historyId)
      .single();
    expect(evaluationBefore.error).toBeNull();
    const apiRetry = await api(actors.admin!, "/pdkt/mailbox/reply", {
      mailboxId,
      reply,
      timeTaken: 300,
      simulationSubject: { type: "participant", participantId: creatorId },
    });
    expect(apiRetry.status).toBe(200);
    expect((await apiRetry.json()).data.historyId).toBe(historyId);
    const evaluationAfter = await createAdmin(env)
      .from("pdkt_history")
      .select("evaluation_status,evaluation_completed_at")
      .eq("id", historyId)
      .single();
    expect(evaluationAfter.error).toBeNull();
    expect(evaluationAfter.data).toEqual(evaluationBefore.data);
    const creator = await createAdmin(env)
      .from("pdkt_mailbox_items")
      .select("simulation_subject_peserta_id,simulation_subject_name")
      .eq("id", mailboxId)
      .single();
    expect(creator.error).toBeNull();
    expect(creator.data).toEqual({
      simulation_subject_peserta_id: creatorId,
      simulation_subject_name: `Creator ${ns}`,
    });
  }
});

test("omitted reply selection records verified replier self, never creator participant", async () => {
  const mailboxId = await mailbox();
  const response = await api(actors.agent!, "/pdkt/mailbox/reply", {
    mailboxId,
    reply,
    timeTaken: 30,
  });
  expect(response.status).toBe(200);
  const historyId = (await response.json()).data.historyId as string;
  historyIds.push(historyId);
  await waitEvaluation(historyId);
  const row = await createAdmin(env)
    .from("pdkt_history")
    .select(
      "simulation_subject_type,simulation_subject_peserta_id,simulation_subject_name,simulation_subject_batch_name,simulation_subject_team",
    )
    .eq("id", historyId)
    .single();
  expect(row.error).toBeNull();
  expect(row.data).toEqual({
    simulation_subject_type: "self",
    simulation_subject_peserta_id: null,
    simulation_subject_name: "E2E agent",
    simulation_subject_batch_name: null,
    simulation_subject_team: null,
  });
});

test("legacy reply RPCs default to verified replier self, never creator participant", async () => {
  const ids: string[] = [];
  for (const rpc of [
    "submit_pdkt_mailbox_reply",
    "submit_pdkt_mailbox_reply_with_outcome",
  ]) {
    const result = await userClient(actors.trainer).rpc(rpc, {
      p_mailbox_id: await mailbox(),
      p_agent_reply: reply,
      p_time_taken: 30,
    });
    expect(result.error).toBeNull();
    const id =
      typeof result.data === "string" ? result.data : result.data.history_id;
    historyIds.push(id);
    ids.push(id);
  }
  for (const id of ids) {
    const row = await createAdmin(env)
      .from("pdkt_history")
      .select(
        "simulation_subject_type,simulation_subject_peserta_id,simulation_subject_name,simulation_subject_batch_name,simulation_subject_team",
      )
      .eq("id", id)
      .single();
    expect(row.error).toBeNull();
    expect(row.data).toEqual({
      simulation_subject_type: "self",
      simulation_subject_peserta_id: null,
      simulation_subject_name: "E2E trainer",
      simulation_subject_batch_name: null,
      simulation_subject_team: null,
    });
  }
});
