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
  reveal,
  respondAndReveal,
} from "./helpers/ketikSessionApiHarness";

test.describe.configure({ mode: "serial" });

test.beforeAll(setupKetikSessionSuite);

test.afterAll(teardownKetikSessionSuite);

test("held responses stay outside the transcript and history until reveal", async () => {
  const live = await start();
  const path = `/sessions/${live.id}`;
  const appended = await api(trainer, `${path}/messages`, "POST", {
    requestId: randomUUID(),
    expectedAgentVersion: 0,
    text: "Tolong jelaskan tagihannya.",
  });
  expect(appended.status).toBe(200);
  const transcript = (await appended.json()).data.messages;
  const requestId = randomUUID();
  const generated = await api(trainer, `${path}/respond`, "POST", {
    requestId,
  });
  expect(generated.status).toBe(200);
  expect((await generated.json()).data.messages).toEqual(transcript);
  const reloaded = await api(trainer, path);
  expect((await reloaded.json()).data).toMatchObject({
    messages: transcript,
    pendingResponse: { requestId, status: "held", contextAgentVersion: 1 },
  });
  const finished = await api(trainer, `${path}/finish`, "POST", {});
  expect(finished.status).toBe(200);
  expect((await finished.json()).data.messages).toEqual(transcript);
  const lateReveal = await api(trainer, `${path}/reveal`, "POST", {
    requestId,
    expectedAgentVersion: 1,
    expectedRetryCount: 0,
  });
  expect(lateReveal.status).toBe(200);
  expect((await lateReveal.json()).data.messages).toEqual(transcript);
});

test("reveal refreshes stale context once and waits for the latest version before publishing", async () => {
  const live = await start();
  const path = `/sessions/${live.id}`;
  const requestId = randomUUID();
  const respond = () => api(trainer, `${path}/respond`, "POST", { requestId });
  const revealAt = (expectedAgentVersion: number, expectedRetryCount = 0) =>
    reveal(live.id, requestId, expectedAgentVersion, expectedRetryCount);
  const append = async (expectedAgentVersion: number, text: string) => {
    const result = await api(trainer, `${path}/messages`, "POST", {
      requestId: randomUUID(),
      expectedAgentVersion,
      text,
    });
    expect(result.status).toBe(200);
  };
  async function data(result: Response) {
    expect(result.status).toBe(200);
    return (await result.json()).data;
  }

  const calls = suite.providerCalls;
  const previousText = suite.providerText;
  try {
    await append(0, "Konteks satu.");
    suite.providerText = "Jawaban usang.";
    expect((await data(await respond())).pendingResponse).toMatchObject({
      status: "held",
      contextAgentVersion: 1,
      retryCount: 0,
    });
    await append(1, "Konteks dua khusus untuk regenerasi.");
    expect((await data(await revealAt(1))).pendingResponse.status).toBe("held");
    const queued = await data(await revealAt(2));
    expect(queued.pendingResponse).toMatchObject({
      status: "retry_ready",
      retryCount: 1,
    });
    expect(queued.messages.slice(1)).toHaveLength(2);
    expect(suite.providerCalls).toBe(calls + 1);

    suite.providerText = "Jawaban dengan konteks dua.[BREAK]Pesan kedua.";
    const regenerated = await data(await respond());
    expect(regenerated.pendingResponse).toMatchObject({
      status: "held",
      contextAgentVersion: 2,
      retryCount: 1,
    });
    expect(suite.providerPayloads.at(-1)).toContain(
      "Konteks dua khusus untuk regenerasi.",
    );
    expect((await data(await revealAt(2))).pendingResponse.status).toBe("held");
    await append(2, "Konteks tiga saat balasan sudah ditahan.");
    expect((await data(await revealAt(2, 1))).messages.slice(1)).toHaveLength(
      3,
    );
    const published = await data(await revealAt(3, 1));
    expect(published.pendingResponse).toBeNull();
    expect(
      published.messages
        .slice(1)
        .map((message: { text: string }) => message.text),
    ).toEqual([
      "Konteks satu.",
      "Konteks dua khusus untuk regenerasi.",
      "Konteks tiga saat balasan sudah ditahan.",
      "Jawaban dengan konteks dua.",
      "Pesan kedua.",
    ]);
    expect((await data(await revealAt(3, 1))).messages).toEqual(
      published.messages,
    );
    expect(suite.providerCalls).toBe(calls + 2);
    expect(
      (await data(await api(trainer, `${path}/finish`, "POST", {}))).messages,
    ).toEqual(published.messages);
  } finally {
    suite.providerText = previousText;
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
    expect(data.pendingResponse).toMatchObject({
      status: "held",
      contextAgentVersion: 1,
    });
    expect(suite.providerCalls).toBe(callsBefore + 1);
    const queued = await reveal(session.id, responseRequestId, 2);
    expect(queued.status).toBe(200);
    expect((await queued.json()).data.pendingResponse.status).toBe(
      "retry_ready",
    );
    const published = await respondAndReveal(session.id, 2, responseRequestId);
    expect(published.status).toBe(200);
    const current = (await published.json()).data;
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
    expect(current.awaitingResponse).toBe(false);
    expect(
      current.messages.filter(
        (message: { sender: string }) => message.sender === "consumer",
      ),
    ).toHaveLength(2);

    const reloaded = await api(trainer, `/sessions/${session.id}`);
    expect((await reloaded.json()).data.messages).toEqual(current.messages);
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
