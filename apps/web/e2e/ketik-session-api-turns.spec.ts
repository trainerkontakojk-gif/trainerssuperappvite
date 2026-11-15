import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createAdmin } from "./helpers/sidakRealBackend";
import {
  env,
  trainer,
  agent,
  suite,
  marker,
  api,
  setupKetikSessionSuite,
  teardownKetikSessionSuite,
  start,
} from "./helpers/ketikSessionApiHarness";

test.describe.configure({ mode: "serial" });

test.beforeAll(setupKetikSessionSuite);

test.afterAll(teardownKetikSessionSuite);

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
      // The saved gpt-5.4-mini is no longer a KETIK choice; sessions use the default.
      selectedModel: "gemini-3.8-flash",
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
  expect((await start(agent)).config.selectedModel).toBe("gemini-3.8-flash");
});

test("messages, time, model and finalized history come from the server and duplicates spend no extra AI", async () => {
  const session = await start();
  const request = {
    requestId: randomUUID(),
    expectedVersion: 0,
    text: "Selamat pagi.",
  };
  const calls = suite.providerCalls;
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
  expect(suite.providerCalls).toBe(calls + 1);
  const repeated = await api(
    trainer,
    `/sessions/${session.id}/turns`,
    "POST",
    request,
  );
  expect((await repeated.json()).data.messages).toEqual(updated.messages);
  expect(suite.providerCalls).toBe(calls + 1);
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

test("agent messages persist immediately and a changed AI context is discarded then regenerated once", async () => {
  const session = await start();
  const firstMessage = {
    requestId: randomUUID(),
    expectedAgentVersion: 0,
    text: "Pesan pertama untuk satu konteks.",
  };
  const callsBefore = suite.providerCalls;
  const usageBefore = await createAdmin(env)
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", trainer.userId)
    .eq("module", "ketik");
  expect(usageBefore.error).toBeNull();
  suite.providerPayloads = [];

  const firstAppend = await api(
    trainer,
    `/sessions/${session.id}/messages`,
    "POST",
    firstMessage,
  );
  expect(firstAppend.status).toBe(200);
  expect(suite.providerCalls).toBe(callsBefore);
  expect((await firstAppend.json()).data).toMatchObject({
    agentVersion: 1,
    awaitingResponse: true,
  });

  let entered!: () => void;
  let release!: () => void;
  const firstProviderStarted = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const firstProviderGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempt = 0;
  suite.providerGate = async () => {
    attempt++;
    if (attempt === 1) {
      entered();
      await firstProviderGate;
    }
  };

  const responseRequestId = randomUUID();
  const response = api(trainer, `/sessions/${session.id}/respond`, "POST", {
    requestId: responseRequestId,
  });
  try {
    await firstProviderStarted;
    const secondAppend = await api(
      trainer,
      `/sessions/${session.id}/messages`,
      "POST",
      {
        requestId: randomUUID(),
        expectedAgentVersion: 1,
        text: "Pesan kedua harus ikut konteks terbaru.",
      },
    );
    expect(secondAppend.status).toBe(200);
    expect((await secondAppend.json()).data).toMatchObject({
      agentVersion: 2,
      awaitingResponse: true,
    });
    release();

    const completed = await response;
    expect(completed.status).toBe(200);
    const data = (await completed.json()).data;
    expect(suite.providerCalls).toBe(callsBefore + 2);
    const usageAfter = await createAdmin(env)
      .from("ai_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", trainer.userId)
      .eq("module", "ketik");
    expect(usageAfter.error).toBeNull();
    expect(usageAfter.count).toBe((usageBefore.count ?? 0) + 2);
    expect(suite.providerPayloads).toHaveLength(2);
    expect(suite.providerPayloads[0]).toContain(firstMessage.text);
    expect(suite.providerPayloads[0]).not.toContain(
      "Pesan kedua harus ikut konteks terbaru.",
    );
    expect(suite.providerPayloads[1]).toContain(firstMessage.text);
    expect(suite.providerPayloads[1]).toContain(
      "Pesan kedua harus ikut konteks terbaru.",
    );
    expect(data.awaitingResponse).toBe(false);
    expect(
      data.messages.filter(
        (message: { sender: string }) => message.sender === "consumer",
      ),
    ).toHaveLength(2);

    const reloaded = await api(trainer, `/sessions/${session.id}`);
    expect((await reloaded.json()).data.messages).toEqual(data.messages);
    const replay = await api(
      trainer,
      `/sessions/${session.id}/respond`,
      "POST",
      { requestId: responseRequestId },
    );
    expect(replay.status).toBe(200);
    expect(suite.providerCalls).toBe(callsBefore + 2);
  } finally {
    suite.providerGate = null;
    release?.();
    await response;
  }
});

test("a second context change supersedes the bounded retry and leaves a fresh response pending", async () => {
  const session = await start();
  const append = async (expectedAgentVersion: number, text: string) => {
    const response = await api(
      trainer,
      `/sessions/${session.id}/messages`,
      "POST",
      { requestId: randomUUID(), expectedAgentVersion, text },
    );
    expect(response.status).toBe(200);
    return (await response.json()).data;
  };
  await append(0, "Konteks awal.");

  let firstEntered!: () => void;
  let secondEntered!: () => void;
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    firstEntered = resolve;
  });
  const secondStarted = new Promise<void>((resolve) => {
    secondEntered = resolve;
  });
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const secondGate = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  let attempt = 0;
  suite.providerGate = async () => {
    attempt++;
    if (attempt === 1) {
      firstEntered();
      await firstGate;
    } else if (attempt === 2) {
      secondEntered();
      await secondGate;
    }
  };
  const callsBefore = suite.providerCalls;
  const response = api(trainer, `/sessions/${session.id}/respond`, "POST", {
    requestId: randomUUID(),
  });
  try {
    await firstStarted;
    await append(1, "Konteks yang memicu satu pengulangan.");
    releaseFirst();
    await secondStarted;
    await append(2, "Konteks yang datang saat pengulangan.");
    releaseSecond();

    const superseded = await response;
    expect(superseded.status).toBe(200);
    const pending = (await superseded.json()).data;
    expect(suite.providerCalls).toBe(callsBefore + 2);
    expect(pending.awaitingResponse).toBe(true);
    expect(
      pending.messages.filter(
        (message: { sender: string }) => message.sender === "consumer",
      ),
    ).toHaveLength(0);

    suite.providerGate = null;
    const fresh = await api(
      trainer,
      `/sessions/${session.id}/respond`,
      "POST",
      { requestId: randomUUID() },
    );
    expect(fresh.status).toBe(200);
    expect((await fresh.json()).data.awaitingResponse).toBe(false);
    expect(suite.providerCalls).toBe(callsBefore + 3);
  } finally {
    suite.providerGate = null;
    releaseFirst?.();
    releaseSecond?.();
    await response;
  }
});

test("provider failure is explicit and retry preserves exactly one agent message", async () => {
  const session = await start();
  const request = {
    requestId: randomUUID(),
    expectedVersion: 0,
    text: "Mohon bantuan.",
  };
  suite.failProvider = true;
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
    suite.failProvider = false;
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
