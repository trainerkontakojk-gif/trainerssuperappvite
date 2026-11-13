import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import type {
  EfekPlanOption,
  EfekSession,
  EfekSessionDetail,
  TnaNeed,
  TnaPlan,
  TnaPlanDetail,
} from "@trainers/types";
import { createTnaFixture } from "./helpers/tnaFixture";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  createAdmin,
  createUserWithJwt,
  runSql,
} from "./helpers/sidakRealBackend";

// EFEK ↔ TNA link (plans/markdown/efek-tna-plan-link.md). Real Hono app
// against loopback Supabase; every row is namespaced and removed.
test.describe.configure({ mode: "serial" });

const namespace = randomUUID();
const fixture = createTnaFixture(namespace);
const admin = createAdmin(fixture.env);
const period = fixture.ids.periods[2]!;
const indicator = fixture.ids.metricsIndicators.alpha;
const person = (i: number) => fixture.ids.participants[i]!;
let users: Awaited<ReturnType<typeof fixture.seed>>;
let app: Hono;
let programId: string;
const denied: Awaited<ReturnType<typeof createUserWithJwt>>[] = [];

const sql = (query: string) => {
  try {
    return runSql(fixture.env, query);
  } catch {
    throw new Error("EFEK link SQL probe failed; raw command suppressed");
  }
};

type Envelope<T> = {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
};

async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
) {
  const response = await tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return {
    status: response.status,
    ...((await response.json()) as Envelope<T>),
  };
}
const tna = <T>(path: string, method = "GET", body?: unknown) =>
  api<T>(`/tna${path}`, { method, body, token: users.trainer.token });
const efek = <T>(path: string, method = "GET", body?: unknown) =>
  api<T>(`/tna/efek${path}`, { method, body, token: users.trainer.token });

async function makePlan(options: {
  activate?: boolean;
  cancel?: boolean;
  service?: string;
  end?: string;
  roster?: string[];
}) {
  const need = await tna<TnaNeed>("/needs", "POST", {
    service_type: options.service ?? "chat",
    period_id: period,
    indicator_id: indicator,
    compare_count: 2,
    validated_cluster_id: "kurang_menggali",
    cause_note: "Trainer memvalidasi tiket untuk rencana pelatihan.",
    gap_type: "skill",
    outcome: "training",
  });
  expect(need.status).toBe(201);
  const created = await tna<TnaPlan>("/plans", "POST", {
    need_id: need.data.id,
    program_id: programId,
    title: `Pelatihan tertaut ${randomUUID().slice(0, 8)}`,
    intervention_type: "kelas",
    start_date: "2099-06-01",
    end_date: options.end ?? "2099-06-30",
    evaluation_due_date: "2099-12-31",
    target_max_rate_per_100: 1,
    target_max_spread_pct: 10,
    participant_peserta_ids: options.roster ?? [person(0), person(1)],
  });
  expect(created.status).toBe(201);
  if (options.activate === false) return created.data;
  const activated = await tna<TnaPlan>(
    `/plans/${created.data.id}/activate`,
    "POST",
    { expected_updated_at: created.data.updated_at },
  );
  expect(activated.status).toBe(200);
  if (!options.cancel) return activated.data;
  const cancelled = await tna<TnaPlan>(
    `/plans/${created.data.id}/cancel`,
    "POST",
    {
      expected_updated_at: activated.data.updated_at,
      cancel_reason: "Dibatalkan untuk pengujian tautan EFEK.",
    },
  );
  expect(cancelled.status).toBe(200);
  return cancelled.data;
}

const session = (overrides: Record<string, unknown> = {}) => ({
  program_code: "ketik",
  title: `Kelas tertaut ${randomUUID().slice(0, 8)}`,
  service_type: "chat",
  start_date: "2099-06-05",
  end_date: "2099-06-05",
  peserta_ids: [person(0), person(1)],
  ...overrides,
});

async function putSession(id: string, overrides: Record<string, unknown>) {
  const current = await efek<EfekSessionDetail>(`/sessions/${id}`);
  const row = current.data;
  return efek(`/sessions/${id}`, "PUT", {
    program_code: row.program_code,
    title: row.title,
    service_type: row.service_type,
    start_date: row.start_date,
    end_date: row.end_date,
    peserta_ids: row.participants.map((p) => p.peserta_id),
    ...overrides,
  });
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: fixture.env.apiUrl,
    VITE_SUPABASE_ANON_KEY: fixture.env.anonKey,
    SUPABASE_ANON_KEY: fixture.env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: fixture.env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  users = await fixture.seed();
  for (const role of ["leader", "agent"] as const)
    denied.push(await createUserWithJwt(fixture.env, role, namespace));
  programId = sql(
    "SELECT id FROM tna_programs WHERE code='effective-probing';",
  ).toString();
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  sql(
    `DELETE FROM efek_sessions WHERE created_by='${users.trainer.userId}'; DELETE FROM tna_plans WHERE need_id IN (SELECT id FROM tna_needs WHERE period_id='${period}'); DELETE FROM tna_needs WHERE period_id='${period}';`,
  );
  for (const user of denied)
    expect((await admin.auth.admin.deleteUser(user.userId)).error).toBeNull();
  await fixture.cleanup();
});

test("a linked session exposes its plan and appears on the plan detail informatively", async () => {
  const plan = await makePlan({});
  const body = session();
  const created = await efek<{ id: string }>("/sessions", "POST", {
    ...body,
    tna_plan_id: plan.id,
  });
  expect(created.status).toBe(201);
  const id = created.data.id;

  const detail = await efek<EfekSessionDetail>(`/sessions/${id}`);
  expect(detail.data.tna_plan).toEqual({
    id: plan.id,
    title: plan.title,
    status: "aktif",
  });
  const list = await efek<{ items: EfekSession[] }>("/sessions?program=ketik");
  expect(list.data.items.find((row) => row.id === id)?.tna_plan).toEqual({
    id: plan.id,
    title: plan.title,
    status: "aktif",
  });

  const planDetail = await tna<TnaPlanDetail>(`/plans/${plan.id}`);
  expect(planDetail.status).toBe(200);
  expect(planDetail.data.service_type).toBe("chat");
  expect(planDetail.data.efek).toMatchObject({
    state: "ok",
    sessions: [
      {
        id,
        program_code: "ketik",
        title: body.title,
        participant_count: 2,
        roster_overlap: 2,
        status: "menunggu",
        mean_delta: null,
      },
    ],
  });
  // Informational only: the verdict inputs are untouched by the link.
  expect(planDetail.data.plan.verdict ?? null).toBeNull();
});

test("plan detail stays readable with an empty EFEK section when nothing is linked", async () => {
  const plan = await makePlan({});
  const planDetail = await tna<TnaPlanDetail>(`/plans/${plan.id}`);
  expect(planDetail.status).toBe(200);
  expect(planDetail.data.efek).toEqual({ state: "ok", sessions: [] });
});

test("links are rejected for draft, cancelled, wrong service, outside dates, and unknown plans", async () => {
  const draft = await makePlan({ activate: false });
  const cancelled = await makePlan({ cancel: true });
  const chatPlan = await makePlan({});
  const narrow = await makePlan({ end: "2099-06-02" });

  const cases: Record<string, unknown>[] = [
    { tna_plan_id: draft.id },
    { tna_plan_id: cancelled.id },
    { tna_plan_id: chatPlan.id, service_type: "call" },
    {
      tna_plan_id: narrow.id,
      start_date: "2099-07-01",
      end_date: "2099-07-01",
    },
    { tna_plan_id: randomUUID() },
  ];
  for (const body of cases) {
    const result = await efek("/sessions", "POST", { ...session(), ...body });
    expect(result.status).toBe(422);
    expect(result.error?.code).toBe("EFEK_PLAN_INVALID");
  }
});

test("edit can attach, replace, and detach a link, and keeps an unchanged cancelled link", async () => {
  const plan = await makePlan({});
  const other = await makePlan({});
  const created = await efek<{ id: string }>("/sessions", "POST", session());
  expect(created.status).toBe(201);
  const id = created.data.id;

  const attached = await putSession(id, { tna_plan_id: plan.id });
  expect(attached.status).toBe(200);
  expect(
    (await efek<EfekSessionDetail>(`/sessions/${id}`)).data.tna_plan,
  ).toMatchObject({ id: plan.id });

  const replaced = await putSession(id, { tna_plan_id: other.id });
  expect(replaced.status).toBe(200);
  expect(
    (await efek<EfekSessionDetail>(`/sessions/${id}`)).data.tna_plan,
  ).toMatchObject({ id: other.id });

  const detached = await putSession(id, { tna_plan_id: null });
  expect(detached.status).toBe(200);
  expect(
    (await efek<EfekSessionDetail>(`/sessions/${id}`)).data.tna_plan,
  ).toBeNull();

  expect((await putSession(id, { tna_plan_id: plan.id })).status).toBe(200);
  const current = await tna<TnaPlanDetail>(`/plans/${plan.id}`);
  const cancelled = await tna<TnaPlan>(`/plans/${plan.id}/cancel`, "POST", {
    expected_updated_at: current.data.plan.updated_at,
    cancel_reason: "Dibatalkan setelah sesi ditautkan.",
  });
  expect(cancelled.status).toBe(200);
  // Same value: the storage rule, not the selectable status, applies.
  expect((await putSession(id, { tna_plan_id: plan.id })).status).toBe(200);
  expect(
    (await efek<EfekSessionDetail>(`/sessions/${id}`)).data.tna_plan,
  ).toMatchObject({ id: plan.id, status: "dibatalkan" });

  // An edit that omits tna_plan_id keeps the link; only an explicit null detaches.
  expect(
    (await putSession(id, { title: "Judul diubah tanpa tautan" })).status,
  ).toBe(200);
  expect(
    (await efek<EfekSessionDetail>(`/sessions/${id}`)).data.tna_plan,
  ).toMatchObject({ id: plan.id });
});

test("import merges without touching links and rejects a tna_plan_id payload", async () => {
  const plan = await makePlan({});
  const title = `Kelas impor tertaut ${randomUUID().slice(0, 8)}`;
  const created = await efek<{ id: string }>("/sessions", "POST", {
    ...session({ title }),
    tna_plan_id: plan.id,
  });
  expect(created.status).toBe(201);

  const merged = await efek("/import", "POST", {
    sessions: [session({ title, peserta_ids: [person(2)] })],
  });
  expect(merged.status).toBe(201);
  const after = await efek<EfekSessionDetail>(`/sessions/${created.data.id}`);
  expect(after.data.participants.map((p) => p.peserta_id)).toEqual(
    expect.arrayContaining([person(0), person(2)]),
  );
  expect(after.data.tna_plan).toMatchObject({ id: plan.id });

  const withPlan = await efek("/import", "POST", {
    sessions: [
      {
        ...session({ title: `Impor terlarang ${randomUUID().slice(0, 8)}` }),
        tna_plan_id: plan.id,
      },
    ],
  });
  expect(withPlan.status).toBe(400);
});

test("plan options filter by status, service, and date; readers cannot write", async () => {
  const live = await makePlan({});
  const draft = await makePlan({ activate: false });
  const cancelled = await makePlan({ cancel: true });

  const options = await efek<EfekPlanOption[]>(
    "/plan-options?service_type=chat&start_date=2099-06-05",
  );
  expect(options.status).toBe(200);
  const ids = options.data.map((row) => row.id);
  expect(ids).toContain(live.id);
  expect(ids).not.toContain(draft.id);
  expect(ids).not.toContain(cancelled.id);
  expect(options.data.find((row) => row.id === live.id)).toMatchObject({
    title: live.title,
    status: "aktif",
    service_type: "chat",
    start_date: "2099-06-01",
    end_date: "2099-06-30",
  });
  expect(
    options.data.find((row) => row.id === live.id)!.participant_ids.sort(),
  ).toEqual([person(0), person(1)].sort());

  const outside = await efek<EfekPlanOption[]>(
    "/plan-options?service_type=chat&start_date=2099-07-05",
  );
  expect(outside.data.map((row) => row.id)).not.toContain(live.id);
  const otherService = await efek<EfekPlanOption[]>(
    "/plan-options?service_type=call&start_date=2099-06-05",
  );
  expect(otherService.status).toBe(200);
  expect(otherService.data).toEqual([]);

  expect((await efek("/plan-options?service_type=chat")).status).toBe(400);
  for (const user of denied) {
    const forbidden = await api<EfekPlanOption[]>(
      "/tna/efek/plan-options?service_type=chat&start_date=2099-06-05",
      { token: user.token },
    );
    expect(forbidden.status).toBe(403);
  }
});
