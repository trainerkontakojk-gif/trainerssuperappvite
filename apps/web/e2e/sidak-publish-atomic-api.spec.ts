import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createAdmin,
  createRealSidakApp,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

// Router and database are real; all fixture rows and the temporary fault trigger
// are uniquely owned by this run. The helper fails closed on non-loopback URLs.
test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
installLoopbackFetchGuard();
const run = randomUUID().replaceAll("-", "");
const periods = [randomUUID(), randomUUID(), randomUUID()];
const versions = Array.from({ length: 10 }, () => randomUUID());
const trigger = `e2e_publish_${run}`;
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
let trainerId = "";
let trainerToken = "";
let app: Awaited<ReturnType<typeof createRealSidakApp>>;

async function publish(id: string) {
  return app.request(`/v1/sidak/rule-versions/${id}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

function errorOf(res: { bodyText: string }) {
  const body = JSON.parse(res.bodyText) as {
    success: boolean;
    error?: { code?: string; message?: string };
  };
  return body.error ?? {};
}

test.beforeAll(async () => {
  const year = sqlOne(
    env,
    `SELECT y FROM generate_series(2000,2100) y WHERE NOT EXISTS (SELECT 1 FROM qa_periods WHERE year=y AND month IN (1,2,3)) ORDER BY y LIMIT 1`,
  );
  const trainer = await createUserWithJwt(env, "trainer", run);
  trainerId = trainer.userId;
  trainerToken = trainer.token;
  app = await createRealSidakApp(env, {
    userId: trainer.userId,
    email: trainer.email,
    token: trainer.token,
    role: "trainer",
    fullName: "E2E trainer",
  });
  runSql(
    env,
    `
    INSERT INTO qa_periods(id,month,year) VALUES (${q(periods[0]!)},1,${year}), (${q(periods[1]!)},2,${year}), (${q(periods[2]!)},3,${year});
    INSERT INTO qa_service_rule_versions(id,service_type,effective_period_id,status,version_number,created_by) VALUES
      (${q(versions[0]!)},'chat',${q(periods[0]!)},'published',1,${q(trainerId)}),
      (${q(versions[1]!)},'chat',${q(periods[0]!)},'draft',2,${q(trainerId)}),
      (${q(versions[2]!)},'chat',${q(periods[1]!)},'published',1,${q(trainerId)}),
      (${q(versions[3]!)},'chat',${q(periods[1]!)},'draft',2,${q(trainerId)}),
      (${q(versions[4]!)},'chat',${q(periods[1]!)},'draft',3,${q(trainerId)}),
      (${q(versions[5]!)},'chat',${q(periods[2]!)},'published',1,${q(trainerId)}),
      (${q(versions[6]!)},'chat',${q(periods[2]!)},'draft',2,${q(trainerId)});
    CREATE FUNCTION public.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF NEW.id = ${q(versions[1]!)}::uuid AND NEW.status = 'published' THEN
        RAISE EXCEPTION 'injected publish failure';
      END IF;
      IF NEW.id IN (${q(versions[3]!)}::uuid, ${q(versions[4]!)}::uuid, ${q(versions[6]!)}::uuid) AND NEW.status = 'published' THEN
        PERFORM pg_sleep(0.4);
      END IF;
      RETURN NEW;
    END $body$;
    CREATE TRIGGER ${trigger} BEFORE UPDATE ON public.qa_service_rule_versions FOR EACH ROW EXECUTE FUNCTION public.${trigger}();
  `,
  );
});

test.afterAll(async () => {
  runSql(
    env,
    `
    DROP TRIGGER IF EXISTS ${trigger} ON public.qa_service_rule_versions;
    DROP FUNCTION IF EXISTS public.${trigger}();
    DELETE FROM activity_logs WHERE user_id=${q(trainerId || randomUUID())};
    DELETE FROM qa_service_rule_versions WHERE id IN (${versions.map(q).join(",")});
    DELETE FROM qa_periods WHERE id IN (${periods.map(q).join(",")});
  `,
  );
  if (trainerId) {
    const result = await createAdmin(env).auth.admin.deleteUser(trainerId);
    if (result.error) throw new Error("fixture auth cleanup failed");
  }
});

test("publish failure leaves the previous version published", async () => {
  const res = await publish(versions[1]!);
  expect(res.status).toBe(500);
  // An unexpected database failure reaches the client as a generic message,
  // never the database's own text.
  const error = await errorOf(res);
  expect(error.code).toBe("INTERNAL_ERROR");
  expect(error.message).toBe(
    "Gagal mempublikasikan versi aturan. Coba lagi beberapa saat lagi.",
  );
  expect(
    sqlOne(
      env,
      `SELECT string_agg(status, ',' ORDER BY version_number) FROM qa_service_rule_versions WHERE effective_period_id=${q(periods[0]!)}`,
    ),
  ).toBe("published,draft");
});

test("concurrent drafts leave exactly one published version", async () => {
  const results = await Promise.all([
    publish(versions[3]!),
    publish(versions[4]!),
  ]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM qa_service_rule_versions WHERE effective_period_id=${q(periods[1]!)} AND status='published'`,
    ),
  ).toBe("1");
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM qa_service_rule_versions WHERE effective_period_id=${q(periods[1]!)} AND status='superseded'`,
    ),
  ).toBe("2");
});

test("publishing the same draft twice accepts only one transition", async () => {
  const results = await Promise.all([
    publish(versions[6]!),
    publish(versions[6]!),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const loser = results.find((r) => r.status === 409)!;
  expect(await errorOf(loser)).toEqual({
    code: "CONFLICT",
    message: "Hanya versi draft yang bisa dipublikasikan",
  });
  expect(
    sqlOne(
      env,
      `SELECT string_agg(status, ',' ORDER BY version_number) FROM qa_service_rule_versions WHERE effective_period_id=${q(periods[2]!)}`,
    ),
  ).toBe("superseded,published");
});

test("direct anonymous and authenticated RPC calls are denied", async () => {
  for (const token of [null, trainerToken]) {
    const client = createClient(env.apiUrl, env.anonKey, {
      auth: { persistSession: false },
      ...(token
        ? { global: { headers: { Authorization: `Bearer ${token}` } } }
        : {}),
    });
    const { error } = await client.rpc("publish_sidak_rule_version", {
      p_id: versions[0],
      p_user_id: trainerId,
      p_change_reason: null,
      p_change_reason_is_set: false,
      p_effective_period_id: null,
    });
    expect(error?.code).toBe("42501");
    expect(error?.message).toContain("SERVICE_ROLE_REQUIRED");
    expect(sqlOne(env, "SELECT 1")).toBe("1");
  }
});

test("SLIK validation keeps the old version until both weights are valid", async () => {
  runSql(
    env,
    `INSERT INTO qa_service_rule_versions(id,service_type,effective_period_id,status,version_number,created_by) VALUES
    (${q(versions[7]!)},'slik',${q(periods[0]!)},'published',1,${q(trainerId)}),
    (${q(versions[8]!)},'slik',${q(periods[0]!)},'draft',2,${q(trainerId)});`,
  );
  const invalid = await publish(versions[8]!);
  expect(invalid.status).toBe(400);
  expect(await errorOf(invalid)).toEqual({
    code: "VALIDATION_ERROR",
    message:
      "Total bobot parameter SLIK pada kategori Critical dan Non Critical masing-masing harus 100%",
  });
  expect(
    sqlOne(
      env,
      `SELECT string_agg(status, ',' ORDER BY version_number) FROM qa_service_rule_versions WHERE id IN (${q(versions[7]!)},${q(versions[8]!)})`,
    ),
  ).toBe("published,draft");
  runSql(
    env,
    `INSERT INTO qa_service_rule_indicators(rule_version_id,service_type,name,category,bobot) VALUES
    (${q(versions[8]!)},'slik','E2E critical','critical',1),
    (${q(versions[8]!)},'slik','E2E non critical','non_critical',1);`,
  );
  expect((await publish(versions[8]!)).status).toBe(200);
  expect(
    sqlOne(
      env,
      `SELECT string_agg(status, ',' ORDER BY version_number) FROM qa_service_rule_versions WHERE id IN (${q(versions[7]!)},${q(versions[8]!)})`,
    ),
  ).toBe("superseded,published");
});

test("moving a draft to another period numbers it in the destination", async () => {
  runSql(
    env,
    `INSERT INTO qa_service_rule_versions(id,service_type,effective_period_id,status,version_number,created_by) VALUES
    (${q(versions[9]!)},'chat',${q(periods[1]!)},'draft',9,${q(trainerId)});`,
  );
  const res = await app.request(
    `/v1/sidak/rule-versions/${versions[9]}/publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        effective_period_id: periods[2],
        change_reason: "E2E moved",
      }),
    },
  );
  expect(res.status).toBe(200);
  expect(
    sqlOne(
      env,
      `SELECT status || '|' || version_number || '|' || effective_period_id::text || '|' || change_reason FROM qa_service_rule_versions WHERE id=${q(versions[9]!)}`,
    ),
  ).toBe(`published|3|${periods[2]}|E2E moved`);
  expect(
    sqlOne(
      env,
      `SELECT status FROM qa_service_rule_versions WHERE id=${q(versions[6]!)}`,
    ),
  ).toBe("superseded");
});

test("publishing an unknown version answers not found", async () => {
  const res = await publish(randomUUID());
  expect(res.status).toBe(404);
  expect(await errorOf(res)).toEqual({
    code: "NOT_FOUND",
    message: "Versi aturan tidak ditemukan",
  });
});
