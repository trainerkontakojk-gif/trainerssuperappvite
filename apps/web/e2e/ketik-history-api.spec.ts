import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { mapSimulationSubjectRowToSnapshot } from "@trainers/types";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

const env = readLoopbackEnv();
const ns = `ketik-history-${randomUUID().slice(0, 8)}`;
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
let owner: Identity;
let other: Identity;
let app: Hono;
let guarded: typeof fetch;
let failDb = false;
const rows: Array<Record<string, unknown>> = [];
const ids: string[] = [];

async function api(path: string, who = owner) {
  return tnaApiRequest(app, `http://localhost/api/v1/ketik${path}`, {
    headers: { Authorization: `Bearer ${who.token}` },
  });
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
  });
  installLoopbackFetchGuard();
  guarded = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      failDb &&
      url.pathname.startsWith("/rest/v1/") &&
      (url.pathname.includes("ketik_history") || url.pathname.includes("rpc/"))
    ) {
      return Response.json(
        { message: "private-history-db-sentinel", code: "XX000" },
        { status: 500 },
      );
    }
    return guarded(input, init);
  };
  owner = await createUserWithJwt(env, "trainer", ns);
  other = await createUserWithJwt(env, "agent", ns);
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(-7, 0, 0, 0); // Midnight WIB on the first day.
  for (let i = 0; i < 65; i++) {
    const id = randomUUID();
    ids.push(id);
    rows.push({
      id,
      user_id: owner.userId,
      date: new Date(
        monthStart.getTime() + (i < 2 ? i - 1 : i) * 1000,
      ).toISOString(),
      scenario_title:
        i === 0
          ? "Sesi paling lama"
          : i === 3
            ? "Literal %, (uji)"
            : `Latihan ${i}`,
      consumer_name: i % 2 ? "Konsumen A" : "Konsumen B",
      messages: [
        {
          id: "m1",
          sender: "agent",
          text: `Transkrip ${i} ${"x".repeat(1000)}`,
          timestamp: monthStart.toISOString(),
        },
      ],
      review_status:
        i % 4 === 0
          ? "completed"
          : i % 4 === 1
            ? "processing"
            : i % 4 === 2
              ? "failed"
              : "pending",
      final_score: i % 4 === 0 ? 60 + i / 4 : null,
      empathy_score: 80,
      probing_score: 70,
      resolution_score: 75,
      typo_score: 90,
      compliance_score: 85,
    });
  }
  // Exact timestamp ties including sub-millisecond precision must keep every UUID.
  for (let i = 50; i < 65; i++)
    rows[i].date = new Date(monthStart.getTime() + 70_000)
      .toISOString()
      .replace(".000Z", ".123456Z");
  expect(
    (await createAdmin(env).from("ketik_history").insert(rows)).error,
  ).toBeNull();
  expect(
    (
      await createAdmin(env).from("ketik_history").insert({
        user_id: other.userId,
        scenario_title: "Owner lain",
        consumer_name: "Rahasia",
        messages: [],
      })
    ).error,
  ).toBeNull();
});

test.afterAll(async () => {
  failDb = false;
  globalThis.fetch = guarded;
  for (const identity of [owner, other].filter(Boolean)) {
    expect(
      (await createAdmin(env).auth.admin.deleteUser(identity.userId)).error,
    ).toBeNull();
  }
});

test("stable bounded pages cover old sessions without transcripts or duplicates; detail remains owner scoped", async ({
  request: _request,
}, info) => {
  const baseline = await api("/history");
  await info.attach("history-payload", {
    body: String((await baseline.clone().text()).length),
    contentType: "text/plain",
  });
  await info.attach("query-plan", {
    body: runSql(
      env,
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id,date,scenario_title,consumer_name FROM public.ketik_history WHERE user_id='${owner.userId}' ORDER BY date DESC,id DESC LIMIT 21;`,
    ),
    contentType: "application/json",
  });
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const response = await api(
      `/history?limit=7${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    expect(response.status).toBe(200);
    const page = (await response.json()).data;
    expect(page.items).toBeDefined();
    expect(page.total).toBe(65);
    expect(page.items.length).toBeLessThanOrEqual(7);
    for (const item of page.items) {
      expect(item).not.toHaveProperty("messages");
      expect(item).not.toHaveProperty("user_id");
      seen.push(item.id);
    }
    cursor = page.nextCursor;
  } while (cursor);
  expect(seen).toHaveLength(65);
  expect(new Set(seen).size).toBe(65);
  const expected = [...rows]
    .sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        String(b.id).localeCompare(String(a.id)),
    )
    .map((r) => r.id);
  expect(seen).toEqual(expected);
  const detail = await api(`/history/${ids[0]}`);
  expect(detail.status).toBe(200);
  expect((await detail.json()).data.messages[0].text).toContain("Transkrip 0");
  expect((await api(`/history/${ids[0]}`, other)).status).toBe(404);
  expect((await api(`/history/${randomUUID()}`)).status).toBe(404);
});

test("server search/status and aggregate summary are independent of page, with literal search and strict cursors", async () => {
  const response = await api("/history?limit=2&status=completed&q=Latihan");
  expect(response.status).toBe(200);
  const page = (await response.json()).data;
  expect(page.total).toBe(16);
  expect(page.counts.all).toBe(63);
  expect(page.reviewedCount).toBe(16);
  expect(page.averageScore).toBe(69);
  expect(
    page.items.every(
      (r: { reviewStatus: string }) => r.reviewStatus === "completed",
    ),
  ).toBe(true);
  const literal = await api(`/history?q=${encodeURIComponent("%, (uji)")}`);
  expect((await literal.json()).data.total).toBe(1);
  for (const path of [
    "?limit=0",
    "?limit=101",
    "?limit=abc",
    "?status=unknown",
    "?cursor=broken",
    "?q=" + "x".repeat(121),
  ]) {
    expect((await api(`/history${path}`)).status).toBe(400);
  }
  expect(
    (
      await api(
        `/history?status=failed&cursor=${encodeURIComponent(page.nextCursor)}`,
      )
    ).status,
  ).toBe(400);
  const invalidCalendar = Buffer.from(
    JSON.stringify({
      date: "2026-02-31T00:00:00Z",
      id: ids[0],
      q: "",
      status: "all",
    }),
  ).toString("base64url");
  expect((await api(`/history?cursor=${invalidCalendar}`)).status).toBe(400);
  expect((await api(`/history?userId=${other.userId}`)).status).toBe(400);

  const summary = await api("/history/summary");
  expect(summary.status).toBe(200);
  const data = (await summary.json()).data;
  expect(data.sessionsThisMonth).toBe(64);
  expect(data.reviewing).toBe(16);
  expect(data.average).toEqual({ score: 74, sessions: 5 });
  expect(data.focus).toEqual({ label: "Probing", score: 70 });
  expect(data.recent).toHaveLength(3);
  expect(data.followUps).toHaveLength(3);
  expect(JSON.stringify(data)).not.toContain("messages");
  const detail = (await (await api(`/history/${ids[64]}`)).json()).data;
  expect(detail.previousFinalScore).toBe(72); // Same-date ties are not an earlier session.
});

test("database failures stay safe visible errors, and history RPCs cannot bypass ownership via user JWT", async () => {
  failDb = true;
  try {
    for (const path of ["/history", "/history/summary", `/history/${ids[0]}`]) {
      const response = await api(path);
      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).not.toContain("private-history-db-sentinel");
      expect(JSON.parse(text).success).toBe(false);
    }
  } finally {
    failDb = false;
  }
  const user = createClient(env.apiUrl, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${other.token}` } },
    auth: { persistSession: false },
  });
  const denied = await user.rpc("ketik_history_page", {
    p_owner: owner.userId,
    p_limit: 20,
  });
  expect(denied.error).not.toBeNull();
  const anon = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false },
  });
  expect(
    (
      await anon.rpc("ketik_history_page", {
        p_owner: owner.userId,
        p_limit: 20,
      })
    ).error,
  ).not.toBeNull();
});

test("counts exceed the PostgREST row cap and index/payload evidence uses the same fixture before and after", async ({
  request: _request,
}, info) => {
  runSql(
    env,
    `INSERT INTO public.ketik_history(user_id,date,scenario_title,consumer_name,messages,review_status)
    SELECT '${other.userId}',now()-n*interval '1 millisecond','Mesure '||n,'Konsumen',
      jsonb_build_array(jsonb_build_object('id','m','sender','agent','text',repeat('x',2000),'timestamp',now())),'processing'
    FROM generate_series(1,2000) n; ANALYZE public.ketik_history;`,
  );
  const projection = "id,date,scenario_title,consumer_name";
  const query = `SELECT ${projection} FROM public.ketik_history WHERE user_id='${other.userId}' ORDER BY date DESC,id DESC LIMIT 21`;
  const before = runSql(
    env,
    `BEGIN; DROP INDEX public.ketik_history_owner_date_id_idx; EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query}; ROLLBACK;`,
  );
  const after = runSql(env, `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query};`);
  await info.attach("plan-before-index", {
    body: before,
    contentType: "application/json",
  });
  await info.attach("plan-after-index", {
    body: after,
    contentType: "application/json",
  });
  const oldRows = await createAdmin(env)
    .from("ketik_history")
    .select("*")
    .eq("user_id", other.userId)
    .order("date", { ascending: false })
    .limit(50);
  expect(oldRows.error).toBeNull();
  const oldItems = oldRows.data!.map((r) => ({
    id: r.id,
    date: r.date,
    scenarioTitle: r.scenario_title,
    consumerName: r.consumer_name,
    consumerPhone: r.consumer_phone,
    consumerCity: r.consumer_city,
    messages: r.messages,
    simulationDuration: r.simulation_duration,
    finalScore: r.final_score,
    empathyScore: r.empathy_score,
    probingScore: r.probing_score,
    resolutionScore: r.resolution_score ?? undefined,
    typoScore: r.typo_score,
    complianceScore: r.compliance_score,
    reviewStatus: r.review_status,
    simulationSubject: mapSimulationSubjectRowToSnapshot(r),
  }));
  const oldBytes = Buffer.byteLength(
    JSON.stringify({ success: true, data: oldItems }),
  );
  const response = await api("/history?limit=20", other);
  expect(response.status).toBe(200);
  const newBody = await response.text();
  const data = JSON.parse(newBody).data;
  expect(data.total).toBe(2001);
  expect(data.counts.running).toBe(2000);
  const summary = (await (await api("/history/summary", other)).json()).data;
  expect(summary.reviewing).toBe(2000);
  const evidence = {
    oldHttpTranscript50Bytes: oldBytes,
    newHttpSummary20Bytes: Buffer.byteLength(newBody),
  };
  expect(evidence.newHttpSummary20Bytes).toBeLessThan(oldBytes / 4);
  await info.attach("payload-comparison", {
    body: JSON.stringify(evidence),
    contentType: "application/json",
  });
});

test("local rollback/reapply preserves history and scores while missing RPC stays a visible error", async () => {
  const sql = (name: string) =>
    readFileSync(new URL(`../../../supabase/${name}`, import.meta.url), "utf8");
  const before = runSql(
    env,
    `SELECT count(*),sum(final_score) FROM public.ketik_history WHERE user_id='${owner.userId}';`,
  );
  // Restore the current projection too, including columns added by later migrations.
  const currentPagination = runSql(
    env,
    "SELECT pg_get_functiondef('public.ketik_history_page(uuid,integer,text,text,timestamptz,uuid)'::regprocedure);",
  );
  try {
    runSql(
      env,
      sql("rollbacks/rollback_20261015145210_ketik_history_pagination.sql"),
    );
    expect((await api("/history")).status).toBe(500);
    expect(
      runSql(
        env,
        `SELECT count(*),sum(final_score) FROM public.ketik_history WHERE user_id='${owner.userId}';`,
      ),
    ).toBe(before);
  } finally {
    runSql(env, sql("migrations/20261015145210_ketik_history_pagination.sql"));
    runSql(env, currentPagination);
    runSql(env, "NOTIFY pgrst,'reload schema';");
  }
  await expect
    .poll(async () => (await api("/history")).status, { timeout: 5000 })
    .toBe(200);
  expect(
    runSql(
      env,
      `SELECT count(*),sum(final_score) FROM public.ketik_history WHERE user_id='${owner.userId}';`,
    ),
  ).toBe(before);
});

test("legacy history without NIK/email values returns null in list and detail", async () => {
  const page = (await (await api("/history?limit=100")).json()).data;
  expect(page.items.length).toBeGreaterThan(0);
  for (const item of page.items) {
    expect(item.consumerNik).toBeNull();
    expect(item.consumerEmail).toBeNull();
  }
  const response = await api(`/history/${ids[0]}`);
  expect(response.status).toBe(200);
  expect((await response.json()).data).toMatchObject({
    consumerNik: null,
    consumerEmail: null,
  });
});
