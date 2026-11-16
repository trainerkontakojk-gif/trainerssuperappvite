import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { KETIK_CONSUMER_POOL } from "@trainers/types";
import { createAdmin } from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  env,
  trainer,
  agent,
  app,
  suite,
  triggerName,
  fixtureSql,
  marker,
  api,
  setupKetikSessionSuite,
  teardownKetikSessionSuite,
  start,
  consumerPromptIdentity,
} from "./helpers/ketikSessionApiHarness";

test.describe.configure({ mode: "serial" });

test.beforeAll(setupKetikSessionSuite);

test.afterAll(teardownKetikSessionSuite);

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
  expect(
    (
      await createAdmin(env).from("ketik_session_responses").insert({
        session_id: active.id,
        request_id: randomUUID(),
        context_agent_version: 0,
        status: "completed",
      })
    ).error,
  ).toBeNull();
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
    const responseRead = await client
      .from("ketik_session_responses")
      .select("request_id")
      .eq("session_id", active.id);
    expect(responseRead.error).toBeNull();
    expect(responseRead.data).toHaveLength(identity === trainer ? 1 : 0);
    expect(
      (
        await client
          .from("ketik_session_responses")
          .select("lease")
          .eq("session_id", active.id)
      ).error?.code,
    ).toBe("42501");
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
    expect(
      (
        await client.from("ketik_session_responses").insert({
          session_id: active.id,
          request_id: randomUUID(),
          context_agent_version: 0,
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
        "append_ketik_session_message",
        {
          p_user_id: identity.userId,
          p_session_id: active.id,
          p_request_id: randomUUID(),
          p_expected_agent_version: 0,
          p_text: "Forged",
        },
      ],
      [
        "claim_ketik_session_response",
        {
          p_user_id: identity.userId,
          p_session_id: active.id,
          p_request_id: randomUUID(),
          p_lease_seconds: 30,
        },
      ],
      [
        "settle_ketik_session_response",
        {
          p_user_id: identity.userId,
          p_session_id: active.id,
          p_request_id: randomUUID(),
          p_lease: randomUUID(),
          p_messages: [],
          p_closed: false,
          p_lease_seconds: 30,
        },
      ],
      [
        "fail_ketik_session_response",
        {
          p_user_id: identity.userId,
          p_session_id: active.id,
          p_request_id: randomUUID(),
          p_lease: randomUUID(),
        },
      ],
      [
        "fail_ketik_session_turn",
        {
          p_user_id: identity.userId,
          p_session_id: active.id,
          p_request_id: randomUUID(),
          p_lease: randomUUID(),
        },
      ],
      [
        "transition_ketik_session_status",
        {
          p_user_id: identity.userId,
          p_session_id: active.id,
          p_event: "session_discard",
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
      expect(KETIK_CONSUMER_POOL).toContainEqual(
        expect.objectContaining({ name, gender }),
      );
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

for (const manual of [false, true]) {
  test(`NIK/email ${manual ? "manual anomalies survive" : "pool values persist in"} session snapshot and history`, async () => {
    const before = (await (await api(trainer, "/settings")).json()).data;
    const previousProviderText = suite.providerText;
    const identitySettings = {
      ...before.identitySettings,
      nik: manual ? "327301010190000" : "",
      email: manual ? "latihan@gnail.com" : "",
    };
    try {
      expect(
        (
          await api(trainer, "/settings", "PUT", {
            ...before,
            identitySettings,
          })
        ).status,
      ).toBe(200);
      const session = await start();
      const identity = session.config.identity;
      if (manual) {
        expect(identity.nik).toBe(identitySettings.nik);
        expect(identity.email).toBe(identitySettings.email);
      } else {
        expect(identity.nik).toMatch(/^\d{12}0000$/);
        expect(identity.email).toMatch(/^[^\s@]+@gmail\.com$/);
      }
      const stored = await createAdmin(env)
        .from("ketik_sessions")
        .select("snapshot")
        .eq("id", session.id)
        .single();
      expect(stored.error).toBeNull();
      expect(stored.data?.snapshot.config.identity).toEqual(identity);
      suite.providerPayloads = [];
      if (manual) suite.providerText = "3273010101900000, latihan@gmail.com";
      expect(
        (
          await api(trainer, `/sessions/${session.id}/turns`, "POST", {
            requestId: randomUUID(),
            expectedVersion: 0,
            text: "Mohon NIK dan email Anda.",
          })
        ).status,
      ).toBe(200);
      expect(suite.providerPayloads[0]).toContain(identity.nik);
      expect(suite.providerPayloads[0]).toContain(identity.email);
      expect(suite.providerPayloads[0]).toContain(
        "jangan menyebut NIK/email tanpa diminta",
      );
      if (manual) {
        expect(suite.providerPayloads[0]).toContain("correction");
        expect(suite.providerPayloads[0]).toContain("latihan@gmail.com");
        expect(suite.providerPayloads[0]).toContain("3273010101900000");
        expect(
          consumerPromptIdentity(suite.providerPayloads[0]),
        ).not.toHaveProperty("correctionApplied");
        expect(
          (
            await api(trainer, `/sessions/${session.id}/turns`, "POST", {
              requestId: randomUUID(),
              expectedVersion: 2,
              text: "Boleh diulangi datanya?",
            })
          ).status,
        ).toBe(200);
        expect(
          consumerPromptIdentity(suite.providerPayloads[1]).correctionApplied,
        ).toEqual({
          nik: "3273010101900000",
          email: "latihan@gmail.com",
        });
      }
      const finished = await api(
        trainer,
        `/sessions/${session.id}/finish`,
        "POST",
        {},
      );
      expect(finished.status).toBe(200);
      expect((await finished.json()).data).toMatchObject({
        consumerNik: identity.nik,
        consumerEmail: identity.email,
      });
      const monitoring = await tnaApiRequest(
        app,
        `http://localhost/api/v1/ai/monitoring/history/ketik/${session.id}/review`,
        {
          headers: { Authorization: `Bearer ${trainer.token}` },
        },
      );
      expect(monitoring.status).toBe(200);
      expect((await monitoring.json()).data.session).toMatchObject({
        consumerNik: identity.nik,
        consumerEmail: identity.email,
      });
      const history = await createAdmin(env)
        .from("ketik_history")
        .select("consumer_nik,consumer_email")
        .eq("id", session.id)
        .single();
      expect(history.error).toBeNull();
      expect(history.data).toEqual({
        consumer_nik: identity.nik,
        consumer_email: identity.email,
      });
      const detail = (
        await (await api(trainer, `/history/${session.id}`)).json()
      ).data;
      expect(detail).toMatchObject({
        consumerNik: identity.nik,
        consumerEmail: identity.email,
      });
      const page = (await (await api(trainer, "/history?limit=100")).json())
        .data;
      expect(
        page.items.find((item: { id: string }) => item.id === session.id),
      ).toMatchObject({
        consumerNik: identity.nik,
        consumerEmail: identity.email,
      });
    } finally {
      suite.providerText = previousProviderText;
      expect((await api(trainer, "/settings", "PUT", before)).status).toBe(200);
    }
  });
}
