import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import { createAdmin } from "./helpers/sidakRealBackend";
import {
  env,
  trainer,
  agent,
  suite,
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

test("after expiry the consumer closes once with a reason and the agent can still send closing messages", async () => {
  const session = await start();
  const db = createAdmin(env);
  const append = (text: string, expectedAgentVersion: number) =>
    api(trainer, `/sessions/${session.id}/messages`, "POST", {
      requestId: randomUUID(),
      expectedAgentVersion,
      text,
    });
  expect((await append("Ada yang bisa dibantu?", 0)).status).toBe(200);
  suite.providerText = "Tagihan saya ganda.";
  expect((await respondAndReveal(session.id, 1)).status).toBe(200);
  // The consumer spoke last, so a normal claim would be a no-op.
  const expired = await db
    .from("ketik_sessions")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", session.id);
  expect(expired.error).toBeNull();

  suite.providerPayloads = [];
  suite.providerText =
    "Ya sudah kak, saya ada urusan dulu. Nanti saya hubungi lagi.";
  const calls = suite.providerCalls;
  const closing = await respondAndReveal(session.id, 1);
  expect(closing.status).toBe(200);
  const closed = (await closing.json()).data;
  expect(suite.providerCalls).toBe(calls + 1);
  expect(suite.providerPayloads[0]).toContain("WAKTU CHAT SUDAH HABIS");
  expect(closed.consumerClosed).toBe(true);
  expect(closed.messages.at(-1)).toMatchObject({
    sender: "consumer",
    text: suite.providerText,
  });

  const farewell = await append(
    "Baik, terima kasih sudah menghubungi kami.",
    1,
  );
  expect(farewell.status).toBe(200);
  expect((await farewell.json()).data).toMatchObject({
    agentVersion: 2,
    awaitingResponse: false,
  });
  const again = await api(trainer, `/sessions/${session.id}/respond`, "POST", {
    requestId: randomUUID(),
  });
  expect(again.status).toBe(409);
  expect(suite.providerCalls).toBe(calls + 1);

  const finished = await api(
    trainer,
    `/sessions/${session.id}/finish`,
    "POST",
    {},
  );
  expect(finished.status).toBe(200);
  expect((await finished.json()).data.messages.at(-1)).toMatchObject({
    sender: "agent",
    text: "Baik, terima kasih sudah menghubungi kami.",
  });
  suite.providerText = "Tagihan saya ganda.[BREAK]Mohon dibantu.";
});

test("expired closing response stays observable while processing and failed, then retries the same request", async () => {
  const session = await start();
  const db = createAdmin(env);
  expect(
    (
      await api(trainer, `/sessions/${session.id}/messages`, "POST", {
        requestId: randomUUID(),
        expectedAgentVersion: 0,
        text: "Ada yang bisa dibantu?",
      })
    ).status,
  ).toBe(200);
  suite.providerText = "Tagihan saya ganda.";
  expect((await respondAndReveal(session.id, 1)).status).toBe(200);
  const ordinary = (
    await (await api(trainer, `/sessions/${session.id}`)).json()
  ).data;
  expect(ordinary.messages.at(-1).sender).toBe("consumer");
  expect(ordinary.awaitingResponse).toBe(false);
  expect(ordinary.pendingResponse).toBeNull();
  expect(
    (
      await db
        .from("ketik_sessions")
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("id", session.id)
    ).error,
  ).toBeNull();

  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  suite.providerGate = async () => {
    entered();
    await gate;
  };
  suite.failProvider = true;
  const requestId = randomUUID();
  const closing = api(trainer, `/sessions/${session.id}/respond`, "POST", {
    requestId,
  });
  try {
    await started;
    const calls = suite.providerCalls;
    const response = await api(trainer, `/sessions/${session.id}`);
    expect(response.status).toBe(200);
    const resumed = (await response.json()).data;
    expect(resumed.messages.at(-1).sender).toBe("consumer");
    expect(resumed.awaitingResponse).toBe(true);
    expect(resumed.pendingResponse).toMatchObject({
      requestId,
      status: "processing",
    });
    expect(resumed.pendingResponse.leaseExpiresAt).not.toBeNull();
    expect(suite.providerCalls).toBe(calls); // Reading status never claims/generates.

    release();
    expect((await closing).status).toBe(502);
    suite.providerGate = null;
    const failed = (
      await (await api(trainer, `/sessions/${session.id}`)).json()
    ).data;
    expect(failed.awaitingResponse).toBe(true);
    expect(failed.pendingResponse).toMatchObject({
      requestId,
      status: "failed",
      leaseExpiresAt: null,
    });
    const failedCalls = suite.providerCalls;
    expect((await api(trainer, `/sessions/${session.id}`)).status).toBe(200);
    expect(suite.providerCalls).toBe(failedCalls);

    suite.failProvider = false;
    suite.providerText =
      "Saya ada urusan dulu, nanti saya hubungi lagi ya kak.";
    const retry = await api(
      trainer,
      `/sessions/${session.id}/respond`,
      "POST",
      { requestId },
    );
    expect(retry.status).toBe(200);
    expect((await retry.json()).data.pendingResponse).toMatchObject({
      status: "held",
      closing: true,
    });
    const revealed = await reveal(session.id, requestId, 1);
    expect(revealed.status).toBe(200);
    const closed = (await revealed.json()).data;
    expect(closed.consumerClosed).toBe(true);
    expect(closed.awaitingResponse).toBe(false);
    expect(closed.pendingResponse).toBeNull();
    expect(
      closed.messages.filter(
        (message: { text: string }) => message.text === suite.providerText,
      ),
    ).toHaveLength(1);
    const settledCalls = suite.providerCalls;
    expect(
      (
        await api(trainer, `/sessions/${session.id}/respond`, "POST", {
          requestId,
        })
      ).status,
    ).toBe(200);
    expect(suite.providerCalls).toBe(settledCalls);
    expect(
      (await api(trainer, `/sessions/${session.id}/finish`, "POST", {})).status,
    ).toBe(200);
    const ended = (await (await api(trainer, `/sessions/${session.id}`)).json())
      .data;
    expect(ended.state).toBe("ended");
    expect(ended.awaitingResponse).toBe(false);
    expect(ended.pendingResponse).toBeNull();
  } finally {
    suite.providerGate = null;
    suite.failProvider = false;
    suite.providerText = "Tagihan saya ganda.[BREAK]Mohon dibantu.";
    release();
    await closing;
  }
});

test("terminal sessions do not await a response when the final message came from the agent", async () => {
  const session = await start();
  const calls = suite.providerCalls;
  const appended = await api(
    trainer,
    `/sessions/${session.id}/messages`,
    "POST",
    {
      requestId: randomUUID(),
      expectedAgentVersion: 0,
      text: "Saya akhiri percakapan ini.",
    },
  );
  expect(appended.status).toBe(200);
  expect((await appended.json()).data.awaitingResponse).toBe(true);
  expect(
    (await api(trainer, `/sessions/${session.id}/finish`, "POST", {})).status,
  ).toBe(200);
  const loaded = (await (await api(trainer, `/sessions/${session.id}`)).json())
    .data;
  expect(loaded.state).toBe("ended");
  expect(loaded.consumerClosed).toBe(false);
  expect(loaded.messages.at(-1).sender).toBe("agent");
  expect(loaded.awaitingResponse).toBe(false);
  expect(loaded.pendingResponse).toBeNull();
  expect(suite.providerCalls).toBe(calls);
});

test("a closing after the consumer already said goodbye adds no message", async () => {
  const session = await start();
  const db = createAdmin(env);
  expect(
    (
      await api(trainer, `/sessions/${session.id}/messages`, "POST", {
        requestId: randomUUID(),
        expectedAgentVersion: 0,
        text: "Ada lagi yang bisa dibantu?",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await db
        .from("ketik_sessions")
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("id", session.id)
    ).error,
  ).toBeNull();
  suite.providerText = "[NO_RESPONSE]";
  const closing = await respondAndReveal(session.id, 1);
  expect(closing.status).toBe(200);
  const data = (await closing.json()).data;
  expect(data.consumerClosed).toBe(true);
  expect(data.messages.at(-1).sender).toBe("agent");
  suite.providerText = "Tagihan saya ganda.[BREAK]Mohon dibantu.";
});

test("legacy transcript and generation endpoints cannot bypass session authority", async () => {
  const calls = suite.providerCalls;
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
  expect(suite.providerCalls).toBe(calls);
});

test("historical attachments use the immutable session snapshot, sent-only projection and existing authorization", async () => {
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ZkAAAAASUVORK5CYII=";
  const settingsResponse = await api(trainer, "/settings");
  const original = (await settingsResponse.json()).data;
  try {
    const settings = {
      ...original,
      scenarios: original.scenarios.map(
        (scenario: { id: string }, index: number) => ({
          ...scenario,
          isActive: index === 0,
          images: [
            png,
            "https://example.invalid/unsent-private.png",
            "javascript:alert(1)",
          ],
          imageAlts: ["Bukti asli", "Tidak dikirim", "Sumber tidak aman"],
          script: "private-scenario-script-sentinel",
        }),
      ),
    };
    expect(
      (
        await api(trainer, "/settings", "PUT", settings, {
          "x-settings-version":
            settingsResponse.headers.get("x-settings-version")!,
        })
      ).status,
    ).toBe(200);
    const session = await start();
    suite.providerText =
      "Ini bukti tagihannya [SEND_IMAGE:0] [SEND_IMAGE:2] [SEND_IMAGE:9]";
    const turn = await api(trainer, `/sessions/${session.id}/turns`, "POST", {
      requestId: randomUUID(),
      expectedVersion: session.version,
      text: "Boleh kirim bukti tagihan? [SEND_IMAGE:1]",
    });
    expect(turn.status).toBe(200);
    expect(
      (await api(trainer, `/sessions/${session.id}/finish`, "POST", {})).status,
    ).toBe(200);
    const latest = await api(trainer, "/settings");
    const changed = {
      ...settings,
      scenarios: settings.scenarios.map(
        (scenario: Record<string, unknown>) => ({
          ...scenario,
          images: ["https://example.invalid/latest-settings.png"],
          imageAlts: ["Bukti terbaru"],
        }),
      ),
    };
    expect(
      (
        await api(trainer, "/settings", "PUT", changed, {
          "x-settings-version": latest.headers.get("x-settings-version")!,
        })
      ).status,
    ).toBe(200);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await api(trainer, `/history/${session.id}`);
      expect(response.status).toBe(200);
      const detail = (await response.json()).data;
      // Saved images live in Storage; the detail links the stored file.
      expect(detail.attachments).toEqual([
        {
          index: 0,
          src: expect.stringMatching(
            /\/storage\/v1\/object\/public\/scenario-attachments\/[\da-f]{64}\.png$/,
          ),
          alt: "Bukti asli",
        },
      ]);
      expect(JSON.stringify(detail)).not.toMatch(
        /unsent-private|latest-settings|private-scenario-script|javascript:/,
      );
    }
    expect((await api(agent, `/history/${session.id}`)).status).toBe(404);
    const list = (await (await api(trainer, "/history")).json()).data;
    expect(
      list.items.every(
        (item: Record<string, unknown>) => !("attachments" in item),
      ),
    ).toBe(true);
    suite.failAttachmentRead = true;
    const failed = await api(trainer, `/history/${session.id}`);
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain(
      "private-attachment-read-sentinel",
    );
    suite.failAttachmentRead = false;
    const legacyId = randomUUID();
    expect(
      (
        await createAdmin(env)
          .from("ketik_history")
          .insert({
            id: legacyId,
            user_id: trainer.userId,
            scenario_title: "Legacy",
            consumer_name: "Konsumen",
            messages: [
              {
                id: "legacy-image",
                sender: "consumer",
                text: "[SEND_IMAGE:0]",
              },
            ],
          })
      ).error,
    ).toBeNull();
    const legacy = (await (await api(trainer, `/history/${legacyId}`)).json())
      .data;
    expect(legacy.attachments).toEqual([]);
    await test.info().attach("attachment-history-contract", {
      body: JSON.stringify({
        id: session.id,
        sentIndexes: [0, 2, 9],
        returnedIndexes: [0],
        legacyAttachments: legacy.attachments,
      }),
      contentType: "application/json",
    });
  } finally {
    suite.failAttachmentRead = false;
    suite.providerText = "Tagihan saya ganda.[BREAK]Mohon dibantu.";
    const current = await api(trainer, "/settings");
    expect(
      (
        await api(trainer, "/settings", "PUT", original, {
          "x-settings-version": current.headers.get("x-settings-version")!,
        })
      ).status,
    ).toBe(200);
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
  suite.providerGate = async () => {
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
    suite.providerGate = null;
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
    suite.providerGate = null;
    release();
    await old;
  }
});
