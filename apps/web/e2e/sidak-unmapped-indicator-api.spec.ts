/**
 * E2E real backend: parameter baru di versi aturan harus bisa dicatat sebagai
 * temuan dengan ID master `qa_indicators` (plan
 * `plans/markdown/sidak-unmapped-indicator-findings.md`).
 *
 * Router Hono ASLI (rule-versions, core, temuan) dijalankan in-process terhadap
 * Supabase LOKAL disposable (`apps/api/.env.integration`, loopback fail-closed).
 * Fixture memakai namespace randomUUID dan hanya menghapus baris miliknya.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createAdmin,
  createRealSidakApp,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql as executeSql,
  sqlOne as selectOne,
} from "./helpers/sidakRealBackend";

test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
installLoopbackFetchGuard();

// execFile errors can contain the DB URL/password. Never surface them.
function runSql(_env: typeof env, query: string): string {
  try {
    return executeSql(env, query);
  } catch {
    throw new Error(`fixture SQL failed: ${query.slice(0, 80)}`);
  }
}
function sqlOne(_env: typeof env, query: string): string {
  try {
    return selectOne(env, query);
  } catch {
    throw new Error(`fixture SQL failed: ${query.slice(0, 80)}`);
  }
}

const namespace = randomUUID();
const prefix = `sidak-unmapped-${namespace}`;
const ids = {
  periods: [randomUUID(), randomUUID(), randomUUID()],
  participants: [randomUUID(), randomUUID(), randomUUID()],
  seededMaster: randomUUID(),
  v1: randomUUID(),
  v1MappedSnapshot: randomUUID(),
  v3: randomUUID(),
  v3UnmappedSnapshot: randomUUID(),
};
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const list = (values: string[]) => values.map(q).join(",");

let app: Awaited<ReturnType<typeof createRealSidakApp>>;
let trainerId = "";

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/v1/sidak${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any;
  try {
    json = JSON.parse(res.bodyText);
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function ownedVersionIds(): string[] {
  const created = trainerId
    ? runSql(
        env,
        `SELECT id FROM qa_service_rule_versions WHERE created_by=${q(trainerId)};`,
      )
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  return [...new Set([ids.v1, ids.v3, ...created])];
}

function cleanup() {
  const versions = ownedVersionIds();
  runSql(
    env,
    `BEGIN;
    DELETE FROM qa_temuan WHERE peserta_id IN (${list(ids.participants)});
    ${trainerId ? `DELETE FROM activity_logs WHERE user_id=${q(trainerId)};` : ""}
    DELETE FROM qa_service_rule_versions WHERE id IN (${list(versions)});
    DELETE FROM qa_indicators WHERE id=${q(ids.seededMaster)} OR name LIKE ${q(`${prefix}%`)};
    DELETE FROM profiler_peserta WHERE id IN (${list(ids.participants)});
    DELETE FROM profiler_folders WHERE name=${q(prefix)};
    DELETE FROM qa_periods WHERE id IN (${list(ids.periods)});
    COMMIT;`,
  );
}

test.beforeAll(async () => {
  const year = sqlOne(
    env,
    `SELECT y FROM generate_series(2000, 2100) AS y
     WHERE NOT EXISTS (SELECT 1 FROM qa_periods p WHERE p.year = y AND p.month BETWEEN 1 AND 3)
     ORDER BY y LIMIT 1;`,
  );
  const trainer = await createUserWithJwt(env, "trainer", namespace);
  trainerId = trainer.userId;
  app = await createRealSidakApp(env, {
    userId: trainer.userId,
    email: trainer.email,
    token: trainer.token,
    role: "trainer",
    fullName: "SIDAK unmapped trainer",
  });
  // V1 (draft, P1) berisi satu snapshot mapped ke master seed; V3 (published,
  // P3) hanya berisi snapshot unmapped — data lama sebelum perbaikan.
  runSql(
    env,
    `BEGIN;
    INSERT INTO qa_periods(id,month,year) VALUES
      (${q(ids.periods[0]!)},1,${year}),(${q(ids.periods[1]!)},2,${year}),(${q(ids.periods[2]!)},3,${year});
    INSERT INTO profiler_folders(name) VALUES (${q(prefix)});
    INSERT INTO profiler_peserta(id,batch_name,nama,tim,jabatan,nomor_urut) VALUES
      ${ids.participants.map((id, i) => `(${q(id)},${q(prefix)},${q(`${prefix}-agent-${i}`)},'Chat','Agent',${i + 1})`).join(",")};
    INSERT INTO qa_indicators(id,service_type,name,category,bobot) VALUES
      (${q(ids.seededMaster)},'chat',${q(`${prefix}-seeded`)},'non_critical',0.5);
    INSERT INTO qa_service_rule_versions(id,service_type,effective_period_id,status,critical_weight,non_critical_weight,scoring_mode,version_number,created_by) VALUES
      (${q(ids.v1)},'chat',${q(ids.periods[0]!)},'draft',0.5,0.5,'weighted',1,${q(trainerId)}),
      (${q(ids.v3)},'chat',${q(ids.periods[2]!)},'published',0.5,0.5,'weighted',1,${q(trainerId)});
    INSERT INTO qa_service_rule_indicators(id,rule_version_id,legacy_indicator_id,service_type,name,category,bobot,sort_order) VALUES
      (${q(ids.v1MappedSnapshot)},${q(ids.v1)},${q(ids.seededMaster)},'chat',${q(`${prefix}-seeded`)},'non_critical',0.5,0),
      (${q(ids.v3UnmappedSnapshot)},${q(ids.v3)},NULL,'chat',${q(`${prefix}-legacy-unmapped`)},'non_critical',1,0);
    COMMIT;`,
  );
});

test.afterAll(async () => {
  cleanup();
  if (trainerId) {
    const result = await createAdmin(env).auth.admin.deleteUser(trainerId);
    if (result.error) throw new Error("auth cleanup failed");
  }
});

let newMasterId = "";
let newSnapshotId = "";

test("parameter added via Settings gets an inactive master and can be recorded", async () => {
  const added = await call("POST", `/rule-versions/${ids.v1}/indicators`, {
    service_type: "chat",
    name: `${prefix}-new`,
    parameter_group: "Grup baru",
    category: "non_critical",
    bobot: 0.5,
    sort_order: 1,
  });
  expect(added.status).toBe(201);
  newSnapshotId = added.json.data.id;
  newMasterId = added.json.data.legacy_indicator_id;
  expect(newMasterId).toMatch(/^[0-9a-f-]{36}$/);
  expect(
    sqlOne(
      env,
      `SELECT service_type || '|' || name || '|' || coalesce(parameter_group,'') || '|' || category || '|' || is_active FROM qa_indicators WHERE id=${q(newMasterId)};`,
    ),
  ).toBe(`chat|${prefix}-new|Grup baru|non_critical|false`);

  const published = await call("POST", `/rule-versions/${ids.v1}/publish`, {});
  expect(published.status).toBe(200);

  const config = await call(
    "GET",
    `/resolved-input-config?service_type=chat&period_id=${ids.periods[0]}`,
  );
  expect(config.status).toBe(200);
  const resolved = config.json.data.indicators.find(
    (i: any) => i.ruleIndicatorId === newSnapshotId,
  );
  expect(resolved.id).toBe(newMasterId);

  const saved = await call("POST", "/temuan/batch", {
    peserta_id: ids.participants[0],
    period_id: ids.periods[0],
    service_type: "chat",
    no_tiket: `${prefix}-T1`,
    items: [{ indicator_id: resolved.id, nilai: 1, ketidaksesuaian: "Probe" }],
  });
  expect(saved.status).toBe(201);
  expect(saved.json.data).toMatchObject({
    inserted: 1,
    skipped: 0,
    invalid: 0,
  });
  expect(
    sqlOne(
      env,
      `SELECT indicator_id::text || '|' || rule_version_id::text FROM qa_temuan WHERE no_tiket=${q(`${prefix}-T1`)};`,
    ),
  ).toBe(`${newMasterId}|${ids.v1}`);
});

test("revision keeps the same master id for the new parameter", async () => {
  const revision = await call("POST", "/rule-versions", {
    service_type: "chat",
    source_version_id: ids.v1,
    effective_period_id: ids.periods[1],
  });
  expect(revision.status).toBe(201);
  expect(
    sqlOne(
      env,
      `SELECT legacy_indicator_id::text FROM qa_service_rule_indicators WHERE rule_version_id=${q(revision.json.data.id)} AND name=${q(`${prefix}-new`)};`,
    ),
  ).toBe(newMasterId);
});

test("batch with any invalid item is rejected with 422 and stores nothing", async () => {
  const res = await call("POST", "/temuan/batch", {
    peserta_id: ids.participants[0],
    period_id: ids.periods[0],
    service_type: "chat",
    no_tiket: `${prefix}-T2`,
    items: [
      { indicator_id: ids.seededMaster, nilai: 1 },
      { indicator_id: randomUUID(), nilai: 1 },
    ],
  });
  expect(res.status).toBe(422);
  expect(res.json.success).toBe(false);
  expect(res.json.error.code).toBe("INVALID_INDICATORS");
  expect(res.json.error.details).toHaveLength(1);
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM qa_temuan WHERE no_tiket=${q(`${prefix}-T2`)};`,
    ),
  ).toBe("0");
});

test("all-duplicate batch is an explicit non-error with zero inserts", async () => {
  const res = await call("POST", "/temuan/batch", {
    peserta_id: ids.participants[0],
    period_id: ids.periods[0],
    service_type: "chat",
    no_tiket: `${prefix}-T1`,
    items: [{ indicator_id: newMasterId, nilai: 1 }],
  });
  expect(res.status).toBe(200);
  expect(res.json.data).toMatchObject({ inserted: 0, skipped: 1, invalid: 0 });
});

test("perfect session pads the effective version's parameters", async () => {
  const res = await call("POST", "/temuan/perfect-session", {
    peserta_id: ids.participants[1],
    period_id: ids.periods[0],
    service_type: "chat",
  });
  expect(res.status).toBe(201);
  const rows = runSql(
    env,
    `SELECT indicator_id::text || '|' || coalesce(rule_version_id::text,'NULL') || '|' || coalesce(rule_indicator_id::text,'NULL'), count(*)
     FROM qa_temuan WHERE peserta_id=${q(ids.participants[1]!)} AND is_phantom_padding
     GROUP BY 1 ORDER BY 1;`,
  )
    .split("\n")
    .filter(Boolean)
    .sort();
  expect(rows).toEqual(
    [
      `${ids.seededMaster}|${ids.v1}|${ids.v1MappedSnapshot}|5`,
      `${newMasterId}|${ids.v1}|${newSnapshotId}|5`,
    ].sort(),
  );
});

test("version without mapped parameters rejects masters outside the version", async () => {
  const batch = await call("POST", "/temuan/batch", {
    peserta_id: ids.participants[2],
    period_id: ids.periods[2],
    service_type: "chat",
    no_tiket: `${prefix}-T3`,
    items: [{ indicator_id: ids.seededMaster, nilai: 1 }],
  });
  expect(batch.status).toBe(422);
  expect(batch.json.error.code).toBe("INVALID_INDICATORS");

  const padding = await call("POST", "/temuan/perfect-session", {
    peserta_id: ids.participants[2],
    period_id: ids.periods[2],
    service_type: "chat",
  });
  expect(padding.status).toBe(400);
  expect(padding.json.error.message).toContain("belum terhubung");
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM qa_temuan WHERE peserta_id=${q(ids.participants[2]!)};`,
    ),
  ).toBe("0");
});

test("deleting a draft parameter removes only its unreferenced auto master", async () => {
  const draftId = sqlOne(
    env,
    `SELECT id FROM qa_service_rule_versions WHERE created_by=${q(trainerId)} AND status='draft' AND effective_period_id=${q(ids.periods[1]!)};`,
  );
  const added = await call("POST", `/rule-versions/${draftId}/indicators`, {
    service_type: "chat",
    name: `${prefix}-draft-only`,
    category: "non_critical",
    bobot: 0.1,
  });
  expect(added.status).toBe(201);
  const draftMaster = added.json.data.legacy_indicator_id;
  const removed = await call(
    "DELETE",
    `/rule-versions/${draftId}/indicators/${added.json.data.id}`,
  );
  expect(removed.status).toBe(200);
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM qa_indicators WHERE id=${q(draftMaster)};`,
    ),
  ).toBe("0");

  // The cloned snapshot of the recorded parameter shares its master with V1
  // and a finding: deleting the snapshot must keep that master.
  const cloned = sqlOne(
    env,
    `SELECT id FROM qa_service_rule_indicators WHERE rule_version_id=${q(draftId)} AND legacy_indicator_id=${q(newMasterId)};`,
  );
  const removedClone = await call(
    "DELETE",
    `/rule-versions/${draftId}/indicators/${cloned}`,
  );
  expect(removedClone.status).toBe(200);
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM qa_indicators WHERE id=${q(newMasterId)};`,
    ),
  ).toBe("1");
});

test("re-adding a parameter reuses its master; duplicates in one version are rejected", async () => {
  const draftId = sqlOne(
    env,
    `SELECT id FROM qa_service_rule_versions WHERE created_by=${q(trainerId)} AND status='draft' AND effective_period_id=${q(ids.periods[1]!)};`,
  );
  const body = {
    service_type: "chat",
    name: `${prefix}-seeded`,
    category: "non_critical",
    bobot: 0.5,
  };
  const duplicate = await call("POST", `/rule-versions/${draftId}/indicators`, body);
  expect(duplicate.status).toBe(422);

  const clone = sqlOne(
    env,
    `SELECT id FROM qa_service_rule_indicators WHERE rule_version_id=${q(draftId)} AND legacy_indicator_id=${q(ids.seededMaster)};`,
  );
  expect(
    (await call("DELETE", `/rule-versions/${draftId}/indicators/${clone}`)).status,
  ).toBe(200);
  const readded = await call("POST", `/rule-versions/${draftId}/indicators`, body);
  expect(readded.status).toBe(201);
  expect(readded.json.data.legacy_indicator_id).toBe(ids.seededMaster);
});

test("explicit legacy mapping must reference a master of the same service", async () => {
  const res = await call("POST", `/rule-versions/${ids.v3}/indicators`, {
    service_type: "chat",
    name: `${prefix}-bad-link`,
    category: "non_critical",
    bobot: 0.1,
    legacy_indicator_id: randomUUID(),
  });
  expect(res.status).toBe(422);
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM qa_service_rule_indicators WHERE name=${q(`${prefix}-bad-link`)};`,
    ),
  ).toBe("0");
});
