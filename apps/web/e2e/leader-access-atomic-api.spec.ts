import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  runSql,
  sqlOne,
  type LoopbackEnv,
} from "./helpers/sidakRealBackend";

test.describe.configure({ mode: "serial" });
const workdir = process.env.E2E_SUPABASE_WORKDIR;
if (!workdir)
  throw new Error("Use an explicitly disposable E2E_SUPABASE_WORKDIR");
const local = JSON.parse(
  execFileSync("supabase", ["status", "--workdir", workdir, "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
const env: LoopbackEnv = {
  apiUrl: local.API_URL,
  dbUrl: local.DB_URL,
  anonKey: local.ANON_KEY,
  serviceRoleKey: local.SERVICE_ROLE_KEY,
};
if (
  new URL(env.apiUrl).hostname !== "127.0.0.1" ||
  new URL(env.dbUrl).hostname !== "127.0.0.1"
)
  throw new Error("Loopback target required");
installLoopbackFetchGuard();
const run = randomUUID().replaceAll("-", "");
const reqs = Array.from({ length: 8 }, () => randomUUID());
const groups = Array.from({ length: 3 }, () => randomUUID());
const trigger = `e2e_leader_${run}`;
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
let adminId = "";
let leaderId = "";
let leaderToken = "";
let app: Hono;

test.beforeAll(async () => {
  const actor = await createUserWithJwt(env, "admin", run);
  const leader = await createUserWithJwt(env, "leader", run);
  adminId = actor.userId;
  leaderId = leader.userId;
  leaderToken = leader.token;
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "unused-local-e2e",
    OPENAI_API_KEY: "unused-local-e2e",
  });
  const { adminRouter } = await import("../../api/src/routes/admin");
  app = new Hono()
    .use("*", async (c, next) => {
      c.set("user" as never, { id: adminId, email: actor.email } as never);
      c.set(
        "profile" as never,
        { role: "admin", status: "active", full_name: "E2E" } as never,
      );
      await next();
    })
    .route("/v1/admin", adminRouter);
  runSql(
    env,
    `INSERT INTO access_groups(id,name,created_by) VALUES ${groups.map((g, i) => `(${q(g)},'E2E ${run} ${i}',${q(adminId)})`).join(",")};
    INSERT INTO leader_access_requests(id,leader_user_id,module,status) VALUES (${q(reqs[0]!)},${q(leaderId)},'ktp','pending');`,
  );
});

test.afterAll(async () => {
  if (!adminId) return;
  runSql(
    env,
    `DROP TRIGGER IF EXISTS ${trigger} ON leader_access_request_groups;
    DROP FUNCTION IF EXISTS public.${trigger}();
    DROP TRIGGER IF EXISTS ${trigger}_rollback ON leader_access_requests;
    DROP FUNCTION IF EXISTS public.${trigger}_rollback();
    DELETE FROM leader_access_requests WHERE id IN (${reqs.map(q).join(",")});
    DELETE FROM access_groups WHERE id IN (${groups.map(q).join(",")});
    DELETE FROM activity_logs WHERE user_id IN (${q(adminId)},${q(leaderId)});`,
  );
  for (const id of [leaderId, adminId])
    if (id) {
      const result = await createAdmin(env).auth.admin.deleteUser(id);
      expect(result.error).toBeNull();
    }
});

async function call(
  id: string,
  action: "approve" | "reject" | "revoke" | "groups",
  body: object = {},
) {
  return app.request(`/v1/admin/leader-requests/${id}/${action}`, {
    method: action === "groups" ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function reset(status: string = "pending") {
  runSql(
    env,
    `DELETE FROM leader_access_request_groups WHERE request_id=${q(reqs[0]!)}; UPDATE leader_access_requests SET status=${q(status)},reviewed_by=NULL WHERE id=${q(reqs[0]!)};`,
  );
}

test("group insert failure rolls back approval without compensating writes or raw errors", async () => {
  runSql(
    env,
    `CREATE FUNCTION public.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.request_id=${q(reqs[0]!)}::uuid THEN RAISE EXCEPTION 'private injected group failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER ${trigger} BEFORE INSERT ON leader_access_request_groups FOR EACH ROW EXECUTE FUNCTION public.${trigger}();
    CREATE FUNCTION public.${trigger}_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=${q(reqs[0]!)}::uuid AND OLD.status='approved' AND NEW.status='pending' THEN RAISE EXCEPTION 'private failed compensation'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER ${trigger}_rollback BEFORE UPDATE ON leader_access_requests FOR EACH ROW EXECUTE FUNCTION public.${trigger}_rollback();`,
  );
  try {
    const res = await call(reqs[0]!, "approve", {
      accessGroupIds: [groups[0]],
    });
    expect.soft(res.status).toBe(500);
    const body = await res.text();
    expect.soft(body).not.toContain("private");
    expect(
      sqlOne(
        env,
        `SELECT status FROM leader_access_requests WHERE id=${q(reqs[0]!)};`,
      ),
    ).toBe("pending");
  } finally {
    runSql(
      env,
      `DROP TRIGGER ${trigger} ON leader_access_request_groups; DROP FUNCTION public.${trigger}(); DROP TRIGGER ${trigger}_rollback ON leader_access_requests; DROP FUNCTION public.${trigger}_rollback();`,
    );
    reset();
  }
});

test("two approvals have one winner and never revert the approved row", async () => {
  const res = await Promise.all([
    call(reqs[0]!, "approve", { accessGroupIds: [groups[0]] }),
    call(reqs[0]!, "approve", { accessGroupIds: [groups[0]] }),
  ]);
  expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    sqlOne(
      env,
      `SELECT status || ':' || (SELECT count(*) FROM leader_access_request_groups WHERE request_id=${q(reqs[0]!)}) FROM leader_access_requests WHERE id=${q(reqs[0]!)};`,
    ),
  ).toBe("approved:1");
});

test("rejecting an already approved request reports conflict, not success", async () => {
  expect(
    (await call(reqs[0]!, "reject", { note: "late rejection" })).status,
  ).toBe(409);
  expect(
    sqlOne(
      env,
      `SELECT status FROM leader_access_requests WHERE id=${q(reqs[0]!)};`,
    ),
  ).toBe("approved");
});

test("replacement failure preserves all previous group links", async () => {
  runSql(
    env,
    `CREATE FUNCTION public.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.request_id=${q(reqs[0]!)}::uuid THEN RAISE EXCEPTION 'private replacement failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER ${trigger} BEFORE INSERT ON leader_access_request_groups FOR EACH ROW EXECUTE FUNCTION public.${trigger}();`,
  );
  try {
    expect(
      (await call(reqs[0]!, "groups", { accessGroupIds: [groups[1]] })).status,
    ).toBe(500);
    expect(
      sqlOne(
        env,
        `SELECT access_group_id FROM leader_access_request_groups WHERE request_id=${q(reqs[0]!)};`,
      ),
    ).toBe(groups[0]);
  } finally {
    runSql(
      env,
      `DROP TRIGGER ${trigger} ON leader_access_request_groups; DROP FUNCTION public.${trigger}();`,
    );
  }
});

test("approve versus reject serializes to exactly one accepted transition", async () => {
  reset();
  const responses = await Promise.all([
    call(reqs[0]!, "approve", { accessGroupIds: [groups[0]] }),
    call(reqs[0]!, "reject", { note: "declined" }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const status = sqlOne(
    env,
    `SELECT status FROM leader_access_requests WHERE id=${q(reqs[0]!)};`,
  );
  expect(["approved", "rejected"]).toContain(status);
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM leader_access_request_groups WHERE request_id=${q(reqs[0]!)};`,
    ),
  ).toBe(status === "approved" ? "1" : "0");
});

test("invalid groups and self approval cannot change state", async () => {
  reset();
  expect(
    (await call(reqs[0]!, "approve", { accessGroupIds: [randomUUID()] }))
      .status,
  ).toBe(400);
  runSql(
    env,
    `INSERT INTO leader_access_requests(id,leader_user_id,module,status) VALUES (${q(reqs[1]!)},${q(adminId)},'ktp','pending');`,
  );
  expect(
    (await call(reqs[1]!, "approve", { accessGroupIds: [groups[0]] })).status,
  ).toBe(403);
  expect(
    sqlOne(
      env,
      `SELECT status FROM leader_access_requests WHERE id=${q(reqs[0]!)};`,
    ),
  ).toBe("pending");
  expect(
    sqlOne(
      env,
      `SELECT status || ':' || (SELECT count(*) FROM leader_access_request_groups WHERE request_id=${q(reqs[1]!)}) FROM leader_access_requests WHERE id=${q(reqs[1]!)};`,
    ),
  ).toBe("pending:0");
});

test("transition RPC rejects anonymous and authenticated callers", async () => {
  for (const token of [null, leaderToken]) {
    const client = createClient(env.apiUrl, env.anonKey, {
      auth: { persistSession: false },
      ...(token
        ? { global: { headers: { Authorization: `Bearer ${token}` } } }
        : {}),
    });
    const { error } = await client.rpc("transition_leader_access", {
      p_request_id: reqs[0],
      p_reviewer_id: adminId,
      p_action: "approve",
      p_group_ids: [groups[0]],
      p_note: null,
    });
    expect(error?.code).toBe("42501");
  }
});
