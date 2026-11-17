import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createAdmin } from "./helpers/sidakRealBackend";
import { laterMigrationsRedefiningRollback } from "./helpers/migrationReapply";
import {
  env,
  trainer,
  suite,
  fixtureSql,
  api,
  setupKetikSessionSuite,
  teardownKetikSessionSuite,
  start,
} from "./helpers/ketikSessionApiHarness";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_KETIK_LIVE !== "1",
  "Requires disposable local Supabase",
);
test.beforeAll(setupKetikSessionSuite);
test.afterAll(teardownKetikSessionSuite);

async function append(id: string) {
  const result = await api(trainer, `/sessions/${id}/messages`, "POST", {
    requestId: randomUUID(),
    expectedAgentVersion: 0,
    text: "Mohon periksa tagihan saya.",
  });
  expect(result.status).toBe(200);
}

async function closeWithResponse() {
  const session = await start();
  await append(session.id);
  suite.providerText = "[NO_RESPONSE]";
  try {
    const response = await api(
      trainer,
      `/sessions/${session.id}/respond`,
      "POST",
      {
        requestId: randomUUID(),
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.consumerClosed).toBe(true);
  } finally {
    suite.providerText = "Tagihan saya ganda.[BREAK]Mohon dibantu.";
  }
  return session;
}

test("closed consumer reply refuses new turn and response claims", async () => {
  const session = await closeWithResponse();
  expect(
    (
      await api(trainer, `/sessions/${session.id}/turns`, "POST", {
        requestId: randomUUID(),
        expectedVersion: 2,
        text: "Pesan baru",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await api(trainer, `/sessions/${session.id}/respond`, "POST", {
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(409);

  const legacy = await start();
  suite.providerText = "[NO_RESPONSE]";
  try {
    const result = await api(trainer, `/sessions/${legacy.id}/turns`, "POST", {
      requestId: randomUUID(),
      expectedVersion: 0,
      text: "Mohon dibantu.",
    });
    expect(result.status).toBe(200);
    expect((await result.json()).data.consumerClosed).toBe(true);
  } finally {
    suite.providerText = "Tagihan saya ganda.[BREAK]Mohon dibantu.";
  }
});

test("reply published after expiry closes the consumer and preserves its last word", async () => {
  const session = await start();
  await append(session.id);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  suite.providerText = "Saya akan menghubungi lagi.";
  suite.providerGate = async () => {
    entered();
    await gate;
  };
  const pending = api(trainer, `/sessions/${session.id}/respond`, "POST", {
    requestId: randomUUID(),
  });
  try {
    await started;
    const expired = await createAdmin(env)
      .from("ketik_sessions")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", session.id);
    expect(expired.error).toBeNull();
    release();
    const result = await pending;
    expect(result.status).toBe(200);
    const data = (await result.json()).data;
    expect(data.consumerClosed).toBe(true);
    expect(data.messages.at(-1)).toMatchObject({
      sender: "consumer",
      text: suite.providerText,
    });
  } finally {
    release();
    suite.providerGate = null;
    suite.providerText = "Tagihan saya ganda.[BREAK]Mohon dibantu.";
    await pending.catch(() => undefined);
  }
});

test("consumer_close on an already closed session is a no-op", async () => {
  const session = await closeWithResponse();
  const before = fixtureSql(
    `SELECT to_jsonb(s) FROM public.ketik_sessions s WHERE id = '${session.id}'`,
  );
  const result = await createAdmin(env).rpc("transition_ketik_session_status", {
    p_user_id: trainer.userId,
    p_session_id: session.id,
    p_event: "consumer_close",
  });
  expect(result.error).toBeNull();
  expect(result.data).toBe(false);
  expect(
    fixtureSql(
      `SELECT to_jsonb(s) FROM public.ketik_sessions s WHERE id = '${session.id}'`,
    ),
  ).toBe(before);
});

test("local rollback restores prior functions without data loss and reapply restores consumer_close", async () => {
  test.skip(
    !process.env.E2E_SUPABASE_WORKDIR,
    "Requires an explicit disposable workdir",
  );
  const session = await start();
  await append(session.id);
  const snapshot = () =>
    fixtureSql(`
    SELECT jsonb_build_object(
      'sessions', (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.ketik_sessions s WHERE user_id = '${trainer.userId}'),
      'turns', (SELECT jsonb_agg(to_jsonb(t) ORDER BY session_id, request_id) FROM public.ketik_session_turns t WHERE session_id IN (SELECT id FROM public.ketik_sessions WHERE user_id = '${trainer.userId}')),
      'responses', (SELECT jsonb_agg(to_jsonb(r) ORDER BY session_id, request_id) FROM public.ketik_session_responses r WHERE session_id IN (SELECT id FROM public.ketik_sessions WHERE user_id = '${trainer.userId}')),
      'history', (SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM public.ketik_history h WHERE user_id = '${trainer.userId}')
    );
  `);
  const before = snapshot();
  const sql = (file: string) =>
    readFileSync(new URL(`../../../supabase/${file}`, import.meta.url), "utf8");
  const names = [
    "transition_ketik_session_status",
    "publish_ketik_session_turn",
    "settle_ketik_session_response",
  ];
  const baseline = sql(
    "migrations/20261116160000_ketik_session_status_transitions.sql",
  );
  const originals = Object.fromEntries(
    names.map((name) => {
      const definition = baseline.split(
        `CREATE OR REPLACE FUNCTION public.${name}(`,
      )[1];
      const match = definition?.match(/AS \$\$([\s\S]*?)\$\$;/);
      expect(match, `Previous definition of ${name}`).toBeTruthy();
      return [name, match![1]!.trim()];
    }),
  );
  const params = {
    p_user_id: trainer.userId,
    p_session_id: session.id,
    p_event: "consumer_close",
  };
  // Reapplying only this migration is HEAD while no later one redefines its RPCs.
  expect(
    laterMigrationsRedefiningRollback("20261116180000"),
    "A later migration redefines a rolled-back RPC; reapply it after this migration",
  ).toEqual([]);
  try {
    fixtureSql(
      sql(
        "rollbacks/rollback_20261116180000_ketik_consumer_close_transition.sql",
      ),
    );
    expect(snapshot()).toBe(before);
    const restored = JSON.parse(
      fixtureSql(
        `SELECT jsonb_object_agg(proname, prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN (${names.map((name) => `'${name}'`).join(",")})`,
      ),
    ) as Record<string, string>;
    expect(
      Object.fromEntries(
        Object.entries(restored).map(([name, body]) => [name, body.trim()]),
      ),
    ).toEqual(originals);
    const oldResult = await createAdmin(env).rpc(
      "transition_ketik_session_status",
      params,
    );
    expect(oldResult.error?.code).toBe("PT409");
    expect(oldResult.error?.message).toBe("Unknown session transition");
  } finally {
    fixtureSql(
      sql("migrations/20261116180000_ketik_consumer_close_transition.sql"),
    );
  }
  expect(snapshot()).toBe(before);
  const restored = await createAdmin(env).rpc(
    "transition_ketik_session_status",
    params,
  );
  expect(restored.error).toBeNull();
  expect(restored.data).toBe(true);
});
