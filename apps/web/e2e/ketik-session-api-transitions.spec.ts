import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createAdmin } from "./helpers/sidakRealBackend";
import { laterMigrationsRedefiningRollback } from "./helpers/migrationReapply";
import {
  env,
  trainer,
  suite,
  triggerName,
  fixtureSql,
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

async function append(id: string, expectedAgentVersion = 0) {
  const response = await api(trainer, `/sessions/${id}/messages`, "POST", {
    requestId: randomUUID(),
    expectedAgentVersion,
    text: "Mohon diperiksa tagihan saya.",
  });
  expect(response.status).toBe(200);
}

async function responseStatus(id: string, requestId: string) {
  const result = await createAdmin(env)
    .from("ketik_session_responses")
    .select("status,lease")
    .eq("session_id", id)
    .eq("request_id", requestId)
    .single();
  expect(result.error).toBeNull();
  return result.data;
}

test("HTTP chat status transitions all pass through the central SQL transition function", async () => {
  // The shared real-backend harness audits the actual PL/pgSQL call stack for
  // every status UPDATE, including provider failure cleanup and finalization.
  try {
    const active = await start();
    await append(active.id);
    const requestId = randomUUID();
    const respond = () =>
      api(trainer, `/sessions/${active.id}/respond`, "POST", { requestId });
    expect((await respond()).status).toBe(200);
    expect(await responseStatus(active.id, requestId)).toEqual({
      status: "held",
      lease: null,
    });
    expect((await reveal(active.id, requestId, 1)).status).toBe(200);
    expect(await responseStatus(active.id, requestId)).toEqual({
      status: "completed",
      lease: null,
    });
    const calls = suite.providerCalls;
    expect((await respond()).status).toBe(200);
    expect(suite.providerCalls).toBe(calls);

    await append(active.id, 1);
    const failedRequestId = randomUUID();
    suite.failProvider = true;
    expect(
      (
        await api(trainer, `/sessions/${active.id}/respond`, "POST", {
          requestId: failedRequestId,
        })
      ).status,
    ).toBe(502);
    expect(await responseStatus(active.id, failedRequestId)).toEqual({
      status: "failed",
      lease: null,
    });
    suite.failProvider = false;
    // Recovery with a new request still needs an explicit reveal.
    expect((await respondAndReveal(active.id, 2)).status).toBe(200);
    const recoveredCalls = suite.providerCalls;
    expect(
      (
        await api(trainer, `/sessions/${active.id}/respond`, "POST", {
          requestId: failedRequestId,
        })
      ).status,
    ).toBe(200);
    expect(suite.providerCalls).toBe(recoveredCalls);
    expect(await responseStatus(active.id, failedRequestId)).toEqual({
      status: "completed",
      lease: null,
    });
    expect(
      (await api(trainer, `/sessions/${active.id}/finish`, "POST", {})).status,
    ).toBe(200);
    expect(
      (await api(trainer, `/sessions/${active.id}/finish`, "POST", {})).status,
    ).toBe(200);

    const empty = await start();
    expect(
      (await api(trainer, `/sessions/${empty.id}/finish`, "POST", {})).status,
    ).toBe(200);
    const discarded = await api(trainer, `/sessions/${empty.id}`);
    expect(discarded.status).toBe(200);
    expect((await discarded.json()).data.state).toBe("discarded");
  } finally {
    suite.failProvider = false;
  }
});

function pauseProvider() {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  suite.providerGate = () => gate;
  return release;
}

test("new transition RPCs deny anon and owner JWT without changing the HTTP chat", async () => {
  const active = await start();
  await append(active.id);
  const before = await api(trainer, `/sessions/${active.id}`);
  expect(before.status).toBe(200);
  const snapshot = (await before.json()).data;
  const params = {
    p_user_id: trainer.userId,
    p_session_id: active.id,
    p_request_id: randomUUID(),
    p_lease: randomUUID(),
  };
  for (const token of [undefined, trainer.token]) {
    const client = createClient(env.apiUrl, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(token
        ? { global: { headers: { Authorization: `Bearer ${token}` } } }
        : {}),
    });
    expect(
      (await client.rpc("fail_ketik_session_turn", params)).error?.code,
    ).toBe("42501");
    expect(
      (
        await client.rpc("transition_ketik_session_status", {
          p_user_id: trainer.userId,
          p_session_id: active.id,
          p_event: "session_discard",
        })
      ).error?.code,
    ).toBe("42501");
  }
  const admin = createAdmin(env);
  const allowed = await admin.rpc("fail_ketik_session_turn", params);
  expect(allowed.error).toBeNull();
  expect(allowed.data).toBe(false); // No matching in-flight lease, not a blanket denial.
  expect(
    (
      await admin.rpc("transition_ketik_session_status", {
        p_user_id: trainer.userId,
        p_session_id: active.id,
        p_event: "unknown_event",
      })
    ).error?.code,
  ).toBe("PT409");
  expect(
    (
      await admin.rpc("transition_ketik_session_status", {
        p_user_id: randomUUID(),
        p_session_id: active.id,
        p_event: "session_discard",
      })
    ).error?.code,
  ).toBe("PT404");
  const after = await api(trainer, `/sessions/${active.id}`);
  expect(after.status).toBe(200);
  expect((await after.json()).data).toEqual(snapshot);
});

test("legacy HTTP failure and explicit retry fence stale failure callbacks", async () => {
  const active = await start();
  const admin = createAdmin(env);
  const request = {
    requestId: randomUUID(),
    expectedVersion: 0,
    text: "Tagihan ganda",
  };
  const readTurn = async () => {
    const row = await admin
      .from("ketik_session_turns")
      .select("status,lease")
      .eq("session_id", active.id)
      .eq("request_id", request.requestId)
      .single();
    expect(row.error).toBeNull();
    return row.data!;
  };
  suite.failProvider = true;
  let release = pauseProvider();
  const calls = suite.providerCalls;
  let pending = api(trainer, `/sessions/${active.id}/turns`, "POST", request);
  try {
    await expect.poll(() => suite.providerCalls).toBe(calls + 1);
    const oldLease = (await readTurn()).lease;
    expect(oldLease).toEqual(expect.any(String));
    release();
    expect((await pending).status).toBe(502);
    expect(await readTurn()).toEqual({ status: "failed", lease: null });

    suite.failProvider = false;
    release = pauseProvider();
    pending = api(trainer, `/sessions/${active.id}/turns`, "POST", request);
    await expect.poll(() => suite.providerCalls).toBe(calls + 2);
    const newLease = (await readTurn()).lease;
    expect(newLease).toEqual(expect.any(String));
    expect(newLease).not.toBe(oldLease);
    const staleFailure = await admin.rpc("fail_ketik_session_turn", {
      p_user_id: trainer.userId,
      p_session_id: active.id,
      p_request_id: request.requestId,
      p_lease: oldLease,
    });
    expect(staleFailure.error).toBeNull();
    expect(staleFailure.data).toBe(false);
    expect(await readTurn()).toEqual({ status: "processing", lease: newLease });

    release();
    const published = await pending;
    expect(published.status).toBe(200);
    expect(
      (await published.json()).data.messages.filter(
        (m: { sender: string }) => m.sender === "agent",
      ),
    ).toHaveLength(1);
    expect(await readTurn()).toEqual({ status: "completed", lease: null });
    const lateFailure = await admin.rpc("fail_ketik_session_turn", {
      p_user_id: trainer.userId,
      p_session_id: active.id,
      p_request_id: request.requestId,
      p_lease: newLease,
    });
    expect(lateFailure.error).toBeNull();
    expect(lateFailure.data).toBe(false);
    expect(
      (await api(trainer, `/sessions/${active.id}/turns`, "POST", request))
        .status,
    ).toBe(200);
    expect(suite.providerCalls).toBe(calls + 2);
    expect(await readTurn()).toEqual({ status: "completed", lease: null });
  } finally {
    release();
    suite.providerGate = null;
    suite.failProvider = false;
    await pending.catch(() => undefined);
  }
});

test("legacy cleanup failure preserves the provider error and expired-lease retry remains explicit", async () => {
  const active = await start();
  const request = {
    requestId: randomUUID(),
    expectedVersion: 0,
    text: "Tagihan ganda",
  };
  fixtureSql(`
    CREATE FUNCTION public.${triggerName}() RETURNS trigger
    LANGUAGE plpgsql SET search_path = '' AS $$
    BEGIN
      IF NEW.status = 'failed' THEN
        RAISE EXCEPTION 'e2e-private-turn-cleanup-error';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER ${triggerName} BEFORE UPDATE OF status
      ON public.ketik_session_turns FOR EACH ROW
      EXECUTE FUNCTION public.${triggerName}();
  `);
  suite.failProvider = true;
  try {
    const failed = await api(
      trainer,
      `/sessions/${active.id}/turns`,
      "POST",
      request,
    );
    expect(failed.status).toBe(502);
    expect(JSON.stringify(await failed.json())).not.toContain("e2e-private");
    const loaded = await api(trainer, `/sessions/${active.id}`);
    expect(loaded.status).toBe(200);
    expect((await loaded.json()).data.pendingTurn).toMatchObject({
      requestId: request.requestId,
      status: "processing",
    });
  } finally {
    suite.failProvider = false;
    fixtureSql(`DROP FUNCTION public.${triggerName}() CASCADE;`);
  }
  // Recovery requires the original ID and an expired lease, not a silent retry.
  const admin = createAdmin(env);
  expect(
    (
      await admin
        .from("ketik_session_turns")
        .update({
          lease_expires_at: new Date(Date.now() - 1000).toISOString(),
        })
        .eq("session_id", active.id)
        .eq("request_id", request.requestId)
    ).error,
  ).toBeNull();
  const retried = await api(
    trainer,
    `/sessions/${active.id}/turns`,
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

test("response reclaim expires the old lease and late provider output cannot replace the completed reply", async () => {
  const active = await start();
  await append(active.id);
  const requestId = randomUUID();
  const calls = suite.providerCalls;
  const previousText = suite.providerText;
  const release = pauseProvider();
  const old = api(trainer, `/sessions/${active.id}/respond`, "POST", {
    requestId,
  });
  try {
    await expect.poll(() => suite.providerCalls).toBe(calls + 1);
    const previous = await responseStatus(active.id, requestId);
    expect(previous?.status).toBe("processing");
    const admin = createAdmin(env);
    expect(
      (
        await admin
          .from("ketik_session_responses")
          .update({
            lease_expires_at: new Date(Date.now() - 1000).toISOString(),
          })
          .eq("session_id", active.id)
          .eq("request_id", requestId)
      ).error,
    ).toBeNull();
    suite.providerGate = null;
    suite.providerText = "Balasan terbaru.";
    const reclaimed = await api(
      trainer,
      `/sessions/${active.id}/respond`,
      "POST",
      { requestId },
    );
    expect(reclaimed.status).toBe(200);
    const held = (await reclaimed.json()).data;
    expect(held.pendingResponse).toMatchObject({ requestId, status: "held" });
    const revealed = await reveal(active.id, requestId, 1);
    expect(revealed.status).toBe(200);
    const published = (await revealed.json()).data;
    expect(
      published.messages.filter(
        (m: { sender: string }) => m.sender === "consumer",
      ),
    ).toHaveLength(1);
    expect(await responseStatus(active.id, requestId)).toEqual({
      status: "completed",
      lease: null,
    });
    release();
    expect((await old).status).toBe(409);
    const after = await api(trainer, `/sessions/${active.id}`);
    expect(after.status).toBe(200);
    expect((await after.json()).data.messages).toEqual(published.messages);
    expect(await responseStatus(active.id, requestId)).toEqual({
      status: "completed",
      lease: null,
    });
    expect(
      (
        await api(trainer, `/sessions/${active.id}/respond`, "POST", {
          requestId,
        })
      ).status,
    ).toBe(200);
    expect(suite.providerCalls).toBe(calls + 2);
  } finally {
    release();
    suite.providerGate = null;
    suite.providerText = previousText;
    await old.catch(() => undefined);
  }
});

test("expired finish cancels in-flight response and legacy turn without late publication", async () => {
  const admin = createAdmin(env);
  for (const kind of ["respond", "turns"] as const) {
    const active = await start();
    if (kind === "respond") await append(active.id);
    const requestId = randomUUID();
    const calls = suite.providerCalls;
    const release = pauseProvider();
    const pending = api(
      trainer,
      `/sessions/${active.id}/${kind}`,
      "POST",
      kind === "respond"
        ? { requestId }
        : { requestId, expectedVersion: 0, text: "Tagihan ganda" },
    );
    try {
      await expect.poll(() => suite.providerCalls).toBe(calls + 1);
      expect(
        (await api(trainer, `/sessions/${active.id}/finish`, "POST", {}))
          .status,
      ).toBe(409);
      expect(
        (
          await admin
            .from("ketik_sessions")
            .update({
              expires_at: new Date(Date.now() - 1000).toISOString(),
            })
            .eq("id", active.id)
        ).error,
      ).toBeNull();
      const finished = await api(
        trainer,
        `/sessions/${active.id}/finish`,
        "POST",
        {},
      );
      expect(finished.status).toBe(200);
      const history = (await finished.json()).data;
      expect(history.id).toBe(active.id);
      expect(
        history.messages.filter(
          (m: { sender: string }) => m.sender === "consumer",
        ),
      ).toHaveLength(0);
      const table =
        kind === "respond" ? "ketik_session_responses" : "ketik_session_turns";
      const terminal = await admin
        .from(table)
        .select("status,lease")
        .eq("session_id", active.id)
        .eq("request_id", requestId)
        .single();
      expect(terminal.error).toBeNull();
      expect(terminal.data).toEqual({ status: "failed", lease: null });

      release();
      expect((await pending).status).toBe(409);
      const resumed = await api(trainer, `/sessions/${active.id}`);
      expect(resumed.status).toBe(200);
      expect((await resumed.json()).data).toMatchObject({
        state: "ended",
        pendingTurn: null,
        pendingResponse: null,
        messages: history.messages,
      });
      const repeated = await api(
        trainer,
        `/sessions/${active.id}/finish`,
        "POST",
        {},
      );
      expect(repeated.status).toBe(200);
      expect((await repeated.json()).data.id).toBe(active.id);
      expect(suite.providerCalls).toBe(calls + 1);
    } finally {
      release();
      suite.providerGate = null;
      await pending.catch(() => undefined);
    }
  }
});

test("local rollback restores previous RPCs without data loss and reapply resumes the HTTP chat", async () => {
  test.skip(
    !process.env.E2E_SUPABASE_WORKDIR,
    "Requires an explicit disposable workdir",
  );
  const active = await start();
  await append(active.id);
  const ended = await start();
  await append(ended.id);
  expect(
    (await api(trainer, `/sessions/${ended.id}/finish`, "POST", {})).status,
  ).toBe(200);
  const snapshot = () =>
    fixtureSql(`
    SELECT jsonb_build_object(
      'sessions', (SELECT jsonb_agg(to_jsonb(s) ORDER BY id)
        FROM public.ketik_sessions s WHERE user_id = '${trainer.userId}'),
      'turns', (SELECT jsonb_agg(to_jsonb(t) ORDER BY session_id, request_id)
        FROM public.ketik_session_turns t WHERE session_id IN
          (SELECT id FROM public.ketik_sessions WHERE user_id = '${trainer.userId}')),
      'responses', (SELECT jsonb_agg(to_jsonb(r) ORDER BY session_id, request_id)
        FROM public.ketik_session_responses r WHERE session_id IN
          (SELECT id FROM public.ketik_sessions WHERE user_id = '${trainer.userId}')),
      'history', (SELECT jsonb_agg(to_jsonb(h) ORDER BY id)
        FROM public.ketik_history h WHERE user_id = '${trainer.userId}')
    );
  `);
  const before = snapshot();
  const sql = (file: string) =>
    readFileSync(new URL(`../../../supabase/${file}`, import.meta.url), "utf8");
  const priorSources = [
    [
      "claim_ketik_session_turn",
      "20261020160000_ketik_durable_agent_messages.sql",
    ],
    ["publish_ketik_session_turn", "20261015140000_ketik_server_sessions.sql"],
    [
      "claim_ketik_session_response",
      "20261021090000_ketik_post_expiry_closing.sql",
    ],
    [
      "settle_ketik_session_response",
      "20261021090000_ketik_post_expiry_closing.sql",
    ],
    [
      "fail_ketik_session_response",
      "20261020160000_ketik_durable_agent_messages.sql",
    ],
    [
      "finish_ketik_session",
      "20261020170000_ketik_history_consumer_nik_email.sql",
    ],
  ];
  const originals = Object.fromEntries(
    priorSources.map(([name, file]) => {
      const match = sql(`migrations/${file}`).match(
        new RegExp(
          `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`,
        ),
      );
      expect(match, `Previous effective definition of ${name}`).not.toBeNull();
      return [name, match![1].trim()];
    }),
  );
  // Reapply the migration and every later one that redefines its RPCs, so the
  // database ends at HEAD and specs that run afterwards test current bodies.
  const reapply = [
    "20261116160000_ketik_session_status_transitions.sql",
    "20261116180000_ketik_consumer_close_transition.sql",
    "20261118120000_ketik_deferred_consumer_replies.sql",
  ];
  expect(
    laterMigrationsRedefiningRollback("20261116160000"),
    "Every later migration that redefines a rolled-back RPC must be in the reapply list",
  ).toEqual(reapply.slice(1));
  try {
    // No HTTP writes while the old database/new API versions are mismatched.
    fixtureSql(
      sql(
        "rollbacks/rollback_20261116160000_ketik_session_status_transitions.sql",
      ),
    );
    expect(snapshot()).toBe(before);
    const restored = JSON.parse(
      fixtureSql(`
      SELECT jsonb_object_agg(proname, prosrc) FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND proname IN
        (${priorSources.map(([name]) => `'${name}'`).join(",")});
    `),
    ) as Record<string, string>;
    expect(
      Object.fromEntries(
        Object.entries(restored).map(([name, body]) => [name, body.trim()]),
      ),
    ).toEqual(originals);
    expect(
      fixtureSql(`SELECT count(*) FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('transition_ketik_session_status', 'fail_ketik_session_turn');`),
    ).toBe("0");
  } finally {
    for (const file of reapply) fixtureSql(sql(`migrations/${file}`));
  }
  expect(snapshot()).toBe(before);
  const admin = createAdmin(env);
  await expect
    .poll(async () => {
      const result = await admin.rpc("fail_ketik_session_turn", {
        p_user_id: trainer.userId,
        p_session_id: active.id,
        p_request_id: randomUUID(),
        p_lease: randomUUID(),
      });
      return { data: result.data, code: result.error?.code ?? null };
    })
    .toEqual({ data: false, code: null });
  expect(
    (
      await api(trainer, `/sessions/${active.id}/respond`, "POST", {
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(200);
  expect(
    (await api(trainer, `/sessions/${active.id}/finish`, "POST", {})).status,
  ).toBe(200);
});

test("rollback discards held payloads and preserves durable messages and history", async () => {
  const id = (await start()).id;
  await append(id);
  const requestId = randomUUID();
  const generated = await api(trainer, `/sessions/${id}/respond`, "POST", {
    requestId,
  });
  expect(generated.status).toBe(200);
  const held = (await generated.json()).data;
  expect(held.pendingResponse).toMatchObject({ requestId, status: "held" });

  const version = "20261118120000";
  const file = `${version}_ketik_deferred_consumer_replies.sql`;
  const sql = (path: string) =>
    readFileSync(new URL(`../../../supabase/${path}`, import.meta.url), "utf8");
  expect(laterMigrationsRedefiningRollback(version)).toEqual([]);
  try {
    fixtureSql(sql(`rollbacks/rollback_${file}`));
    expect(
      fixtureSql(
        `SELECT status FROM public.ketik_session_responses WHERE session_id = '${id}' AND request_id = '${requestId}'`,
      ),
    ).toBe("superseded");
    expect(
      fixtureSql(`SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ketik_session_responses' AND column_name = 'held_messages'`),
    ).toBe("0");
  } finally {
    fixtureSql(sql(`migrations/${file}`));
  }
  const restored = await api(trainer, `/sessions/${id}`);
  expect(restored.status).toBe(200);
  expect((await restored.json()).data).toMatchObject({
    messages: held.messages,
    pendingResponse: null,
  });
  const finished = await api(trainer, `/sessions/${id}/finish`, "POST", {});
  expect(finished.status).toBe(200);
  expect((await finished.json()).data.messages).toEqual(held.messages);
});
