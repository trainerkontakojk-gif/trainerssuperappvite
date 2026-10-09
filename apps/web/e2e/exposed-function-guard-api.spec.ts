import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { expect, test } from "@playwright/test";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  type LoopbackEnv,
} from "./helpers/sidakRealBackend";

// Every RPC matrix fails closed on the global exposed-function invariant.
const GROUP_A = [
  "begin_telefun_realtime_finalization(uuid,uuid,uuid,text)",
  "begin_telefun_realtime_finalization_p5(uuid,uuid,uuid,text)",
  "bind_telefun_realtime_provider_call(uuid,uuid,text)",
  "checkpoint_telefun_realtime_transcript(uuid,uuid,bigint,text,text,text,integer,boolean)",
  "claim_telefun_realtime_attempt(uuid,uuid,uuid,text,text)",
  "claim_telefun_realtime_lease(uuid,uuid,uuid,text,text,integer,integer,integer)",
  "claim_telefun_realtime_orphans(integer)",
  "complete_telefun_realtime_orphan(uuid,uuid,text,boolean,boolean,text)",
  "consume_telefun_realtime_rate_limit(text,uuid,uuid,text,integer,integer)",
  "fail_telefun_realtime_session_without_attempt(uuid,uuid)",
  "finalize_telefun_realtime_attempt(uuid,uuid,uuid,text,integer)",
  "finalize_telefun_realtime_attempt_p5(uuid,uuid,uuid,text,integer)",
  "mark_telefun_realtime_sideband_connected(uuid,uuid)",
  "mark_telefun_realtime_usage(uuid,uuid,text,text)",
  "mark_telefun_recording_ready(uuid,uuid,text,text)",
  "mark_telefun_recording_uploaded(uuid,uuid,text,text,text)",
  "record_telefun_realtime_metric(text,text,text,uuid,uuid,bigint,jsonb)",
  "release_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,text)",
  "renew_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,integer)",
  "store_telefun_realtime_provider_call_reference(uuid,uuid,text)",
  "claim_telefun_scoring(uuid,integer)",
  "claim_telefun_scoring(uuid,integer,text,text)",
  "complete_telefun_scoring(uuid,numeric,jsonb)",
  "complete_telefun_scoring(uuid,numeric,jsonb,text)",
  "fail_telefun_scoring(uuid,text)",
  "fail_telefun_scoring(uuid,text,text)",
  "reschedule_telefun_scoring(uuid,text,timestamptz)",
  "reschedule_telefun_scoring(uuid,text,timestamptz,text)",
  "enqueue_telefun_scoring(uuid)",
  "cleanup_pdkt_mailbox_subject_intents()",
  "delete_monitoring_history(text,uuid)",
  "refresh_mv_qa_period_summary()",
  "get_leader_scope_snapshot(uuid,text)",
  "get_profiler_folder_counts(uuid[])",
] as const;

const GROUP_B = [
  "bulk_reorder_profiler_peserta(jsonb)",
  "soft_delete_pdkt_mailbox_item(uuid)",
  "submit_pdkt_mailbox_batch(text,text,text,text,text,jsonb,jsonb,jsonb)",
  "submit_pdkt_mailbox_batch_with_subject(text,text,text,text,text,jsonb,jsonb,jsonb,text,uuid,text,text,text,uuid)",
  "submit_pdkt_mailbox_reply(uuid,jsonb,integer)",
  "submit_pdkt_mailbox_reply_with_outcome(uuid,jsonb,integer)",
  "upsert_telefun_coaching_summary(uuid,jsonb,integer,text)",
] as const;

let env: LoopbackEnv;
test.beforeAll(() => {
  env = readLoopbackEnv();
  installLoopbackFetchGuard();
});

async function attachJson(name: string, data: unknown): Promise<void> {
  const path = test.info().outputPath(name);
  writeFileSync(path, JSON.stringify(data, null, 2));
  await test.info().attach(name, { path, contentType: "application/json" });
}

function readCatalog<T>(query: string): T {
  return JSON.parse(runSql(env, `BEGIN READ ONLY; ${query}; ROLLBACK;`));
}

function readRevoked() {
  return readCatalog<
    { signature: string; anon: boolean; authenticated: boolean }[]
  >(`SELECT coalesce(json_agg(row_to_json(f) ORDER BY signature), '[]'::json)
    FROM (
      SELECT n.nspname || '.' || p.oid::regprocedure::text AS signature,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public', 'graphql_public') AND p.prokind = 'f'
        AND p.prorettype <> 'trigger'::regtype
        AND (NOT has_function_privilege('anon', p.oid, 'EXECUTE')
          OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    ) f`);
}

function assertGlobalPrecondition(): void {
  expect(
    readRevoked(),
    "STOP S1: global D5.1 must be green before RPC",
  ).toEqual([]);
}

test("D5.1 catalog invariant: no revoked exposed non-trigger functions", async () => {
  const revoked = readRevoked();
  const summary = {
    total: revoked.length,
    groupA: revoked.filter((f) => !f.anon && !f.authenticated).length,
    groupB: revoked.filter((f) => !f.anon && f.authenticated).length,
    revoked,
  };
  console.log("D5.1", JSON.stringify(summary));
  await attachJson("catalog-invariant.json", summary);
  expect(revoked, "STOP S1: catalog must be green before any RPC").toEqual([]);
});

type GroupARow = {
  signature: string;
  name: string | null;
  language: string | null;
  source: string | null;
  securityDefiner: boolean | null;
  anon: boolean | null;
  authenticated: boolean | null;
  serviceRole: boolean | null;
  argNames: string[] | null;
  argTypes: string | null;
};

function readRpcCatalog(signatures: readonly string[] = GROUP_A): GroupARow[] {
  return readCatalog<
    GroupARow[]
  >(`SELECT json_agg(row_to_json(f) ORDER BY signature) FROM (
    SELECT expected.signature, p.proname AS name, l.lanname AS language,
      p.prosrc AS source, p.prosecdef AS "securityDefiner",
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS "serviceRole",
      p.proargnames AS "argNames", oidvectortypes(p.proargtypes) AS "argTypes"
    FROM (VALUES ${signatures.map((s) => `('public.${s}')`).join(",")}) expected(signature)
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
    LEFT JOIN pg_language l ON l.oid = p.prolang
  ) f`);
}

function hasFirstGuard(row: GroupARow): boolean {
  // DECLARE initialisers were reviewed and frozen by T0/T2 (STOP S3).
  const source = (row.source ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .replace(/^\s*#variable_conflict\s+\w+\s*/i, "")
    .replace(/^\s*DECLARE\b[\s\S]*?\bBEGIN\b/i, "BEGIN");
  return (
    row.language === "plpgsql" &&
    row.securityDefiner === true &&
    /^\s*BEGIN\s+PERFORM\s+app_internal\.assert_service_role\(\);/i.test(source)
  );
}

function assertGroupAPrecondition(): GroupARow[] {
  const schemas = (
    JSON.parse(
      execFileSync(
        "docker",
        [
          "inspect",
          "supabase_rest_trainerssuperappvite",
          "--format",
          "{{json .Config.Env}}",
        ],
        { encoding: "utf8" },
      ),
    ) as string[]
  )
    .find((value) => value.startsWith("PGRST_DB_SCHEMAS="))
    ?.slice("PGRST_DB_SCHEMAS=".length)
    .split(",")
    .map((value) => value.trim());
  expect(schemas, "exposed schemas must be explicitly known").toEqual([
    "public",
    "graphql_public",
  ]);
  expect(schemas).not.toContain("app_internal");
  const rows = readRpcCatalog();
  expect(rows).toHaveLength(34);
  const unsafe = rows
    .filter(
      (row) =>
        !hasFirstGuard(row) ||
        !row.anon ||
        !row.authenticated ||
        !row.serviceRole,
    )
    .map(({ signature, language, anon, authenticated, serviceRole }) => ({
      signature,
      language,
      anon,
      authenticated,
      serviceRole,
    }));
  console.log(
    "D5.2",
    JSON.stringify({ schemas, checked: rows.length, unsafe }),
  );
  expect(
    unsafe,
    "STOP S1: all 34 Group A signatures must be granted and guarded before RPC",
  ).toEqual([]);
  const internal = readCatalog<{
    schemaDenied: boolean;
    guardDenied: boolean;
    moved: boolean;
  }>(`
    SELECT json_build_object(
      'schemaDenied', NOT has_schema_privilege('anon','app_internal','USAGE')
        AND NOT has_schema_privilege('authenticated','app_internal','USAGE'),
      'guardDenied', NOT has_function_privilege('anon','app_internal.assert_service_role()','EXECUTE')
        AND NOT has_function_privilege('authenticated','app_internal.assert_service_role()','EXECUTE'),
      'moved', to_regprocedure('public.get_leader_approved_scope_items(uuid,text)') IS NULL
        AND to_regprocedure('app_internal.get_leader_approved_scope_items(uuid,text)') IS NOT NULL
    )`);
  expect(internal).toEqual({
    schemaDenied: true,
    guardDenied: true,
    moved: true,
  });
  return rows;
}

test("D5.2 guard-placement invariant: every Group A overload guarded first", async () => {
  const rows = assertGroupAPrecondition();
  await attachJson("guard-placement-invariant.json", {
    checked: rows.length,
    grantedAndGuarded: true,
  });
});

// One connection for the entire matrix, never recreated/reconnected. Comparing
// backend PID also detects any unexpected psql reconnect after crash recovery.
function startSentinel() {
  const child = spawn(
    "psql",
    [env.dbUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const lines = createInterface({ input: child.stdout });
  let failure: Error | undefined;
  let backendPid: string | undefined;
  let sequence = 0;
  child.on("error", () => {
    failure = new Error("Sentinel psql could not start");
  });
  child.on("exit", () => {
    failure = new Error("Sentinel connection exited");
  });
  child.stderr.on("data", () => {
    failure = new Error("Sentinel emitted a database error");
  });
  child.stdin.on("error", () => {
    failure = new Error("Sentinel stdin closed");
  });
  return {
    async ping(): Promise<true> {
      if (failure || child.exitCode !== null || child.signalCode !== null)
        throw failure ?? new Error("Sentinel is not alive");
      const marker = `sentinel_${++sequence}`;
      const received = await new Promise<string[]>((resolve, reject) => {
        const output: string[] = [];
        const timeout = setTimeout(
          () => finish(new Error("Sentinel SELECT 1 timed out")),
          5000,
        );
        const onExit = () =>
          finish(new Error("Sentinel connection terminated during SELECT 1"));
        const onLine = (line: string) => {
          if (line === marker) finish();
          else output.push(line);
        };
        function finish(error?: Error) {
          clearTimeout(timeout);
          lines.off("line", onLine);
          child.off("exit", onExit);
          if (error) reject(error);
          else resolve(output);
        }
        lines.on("line", onLine);
        child.once("exit", onExit);
        child.stdin.write(
          `SELECT 1;\nSELECT pg_backend_pid();\n\\echo ${marker}\n`,
        );
      });
      if (failure) throw failure;
      expect(received[0]).toBe("1");
      expect(received).toHaveLength(2);
      expect(received[1]).toMatch(/^\d+$/);
      backendPid ??= received[1];
      expect(received[1], "Sentinel must retain the original backend PID").toBe(
        backendPid,
      );
      return true;
    },
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => child.kill("SIGTERM"), 5000);
          child.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
          child.stdin.end("\\q\n");
        });
      }
      lines.close();
    },
  };
}

function dummyArgs(row: GroupARow): Record<string, unknown> {
  const types = row.argTypes ? row.argTypes.split(", ") : [];
  const names = row.argNames ?? [];
  return Object.fromEntries(
    types.map((type, index) => {
      let value: unknown;
      switch (type) {
        case "uuid":
          value = randomUUID();
          break;
        case "uuid[]":
          value = [];
          break;
        case "text":
          value = "e2e-guard";
          break;
        case "bigint":
        case "integer":
        case "numeric":
          value = 1;
          break;
        case "boolean":
          value = false;
          break;
        case "jsonb":
          value = {};
          break;
        case "timestamp with time zone":
          value = "2026-10-08T00:00:00Z";
          break;
        default:
          throw new Error(`Unsupported dummy type ${type} in ${row.signature}`);
      }
      if (!names[index])
        throw new Error(`Missing named argument in ${row.signature}`);
      return [names[index]!, value];
    }),
  );
}

// Include all mutable durable/mailbox/history tables, not just the minimum D5.5.
const SIDE_EFFECT_TABLES = [
  "telefun_realtime_attempts",
  "telefun_realtime_transcript_events",
  "telefun_realtime_metrics",
  "telefun_realtime_leases",
  "telefun_realtime_rate_limits",
  "pdkt_mailbox_subject_intents",
  "pdkt_mailbox_items",
  "ketik_history",
  "pdkt_history",
  "telefun_history",
  "telefun_coaching_summary",
  "profiler_peserta",
  "qa_temuan",
] as const;
function rowCounts(): Record<string, number> {
  return readCatalog(`SELECT json_object_agg(name, count) FROM (
    ${SIDE_EFFECT_TABLES.map((name) => `SELECT '${name}' AS name, count(*) AS count FROM public.${name}`).join(" UNION ALL ")}
  ) counts`);
}

test("D5.3–8 Group A rejection matrix, sentinel, side effects and positive controls", async () => {
  test.setTimeout(180000);
  assertGlobalPrecondition(); // RED stops here: zero RPC, zero users.
  const rows = assertGroupAPrecondition();
  const summary: {
    function: string;
    role: string;
    httpStatus: number;
    code: string | null;
    sentinelAlive: boolean;
  }[] = [];
  const userIds: string[] = [];
  const admin = createAdmin(env);
  const sentinel = startSentinel();
  try {
    await sentinel.ping();
    const roles: { role: string; token?: string }[] = [{ role: "anon" }];
    const suffix = randomUUID();
    for (const role of ["agent", "trainer", "admin"] as const) {
      const identity = await createUserWithJwt(env, role, `${suffix}-${role}`);
      userIds.push(identity.userId);
      roles.push({ role, token: identity.token });
    }
    const before = rowCounts();
    const call = async (
      signature: string,
      role: string,
      token: string | undefined,
      name: string,
      args: Record<string, unknown>,
    ) => {
      // Revalidate global grants immediately before every POST, including controls.
      assertGlobalPrecondition();
      // Q3 is allowed only after public is absent.
      if (signature === "moved") {
        expect(
          runSql(
            env,
            "SELECT to_regprocedure('public.get_leader_approved_scope_items(uuid,text)') IS NULL",
          ),
        ).toBe("t");
      } else {
        const row = readRpcCatalog().find(
          (candidate) => candidate.signature === signature,
        );
        expect(
          row,
          "RPC must belong to the fixed Group A allowlist",
        ).toBeDefined();
        expect(
          row &&
            hasFirstGuard(row) &&
            row.anon &&
            row.authenticated &&
            row.serviceRole,
          "STOP S1: target must still be granted and guarded",
        ).toBe(true);
      }
      let response: Response | undefined;
      let body: { code?: string; message?: string } | unknown;
      let sentinelAlive = false;
      try {
        response = await fetch(`${env.apiUrl}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: {
            apikey: role === "service_role" ? env.serviceRoleKey : env.anonKey,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        // PostgREST returns no body for RETURNS void (the MV refresh control).
        // Every other response, especially denials, must still be valid JSON.
        if (response.status === 204) {
          expect(await response.text()).toBe("");
          body = null;
        } else {
          body = await response.json();
        }
      } finally {
        // Always check the same connection after every attempted RPC, including
        // transport/JSON failures; a failed sentinel aborts all remaining calls.
        try {
          sentinelAlive = await sentinel.ping();
        } finally {
          summary.push({
            function: signature === "moved" ? name : signature,
            role,
            httpStatus: response?.status ?? 0,
            code:
              body && typeof body === "object" && "code" in body
                ? String(body.code)
                : null,
            sentinelAlive,
          });
        }
      }
      return { status: response!.status, body };
    };
    for (const row of rows) {
      const args = dummyArgs(row);
      for (const identity of roles) {
        const result = await call(
          row.signature,
          identity.role,
          identity.token,
          row.name!,
          args,
        );
        expect(result.status).toBe(identity.role === "anon" ? 401 : 403);
        expect(result.body).toMatchObject({
          code: "42501",
          message: "SERVICE_ROLE_REQUIRED",
        });
      }
    }
    expect(
      rowCounts(),
      "Rejection matrix must not change any related table",
    ).toEqual(before);
    await attachJson("side-effects.json", { before, after: rowCounts() });
    const folders = await call(
      "public.get_profiler_folder_counts(uuid[])",
      "service_role",
      env.serviceRoleKey,
      "get_profiler_folder_counts",
      { p_accessible_ids: [] },
    );
    expect(folders.status).toBe(200);
    expect(folders.body).toEqual([]);
    const scope = await call(
      "public.get_leader_scope_snapshot(uuid,text)",
      "service_role",
      env.serviceRoleKey,
      "get_leader_scope_snapshot",
      { p_leader_user_id: randomUUID(), p_module: "sidak" },
    );
    expect(scope.status).toBe(200);
    // Aggregate SQL returns one row of empty arrays, not zero rows.
    expect(scope.body).toEqual([
      {
        request_ids: [],
        peserta_ids: [],
        batch_names: [],
        tims: [],
        service_types: [],
      },
    ]);
    const refresh = await call(
      "public.refresh_mv_qa_period_summary()",
      "service_role",
      env.serviceRoleKey,
      "refresh_mv_qa_period_summary",
      {},
    );
    expect(refresh.status).toBe(204);
    expect(refresh.body).toBeNull();
    const moved = await call(
      "moved",
      "anon",
      undefined,
      "get_leader_approved_scope_items",
      { p_leader_user_id: randomUUID(), p_module: "sidak" },
    );
    expect(moved.status).toBe(404);
    expect(moved.body).toMatchObject({ code: "PGRST202" });
    expect(rowCounts()).toEqual(before);
    expect(summary).toHaveLength(140); // 34 × 4 + 3 controls + Q3.
    expect(summary.every((row) => row.sentinelAlive)).toBe(true);
  } finally {
    await attachJson("group-a-rpc-summary.json", summary);
    console.log(
      "D5.3–8",
      JSON.stringify({
        calls: summary.length,
        sentinelAlive: summary.every((row) => row.sentinelAlive),
      }),
    );
    await sentinel.close();
    const failedCleanups: string[] = [];
    for (const id of userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) failedCleanups.push(id);
    }
    expect(
      failedCleanups,
      "All run-owned local auth users must be removed",
    ).toEqual([]);
  }
});

test("D5.3–5 Group B anon rejection matrix, sentinel and no side effects", async () => {
  assertGlobalPrecondition(); // No RPC while even one exposed grant is missing.
  const rows = readRpcCatalog(GROUP_B);
  expect(rows).toHaveLength(7);
  expect(rows.every((row) => row.name && row.anon && row.authenticated)).toBe(
    true,
  );
  const summary: {
    function: string;
    role: string;
    httpStatus: number;
    code: string | null;
    sentinelAlive: boolean;
  }[] = [];
  const before = rowCounts();
  const sentinel = startSentinel();
  try {
    await sentinel.ping();
    for (const row of rows) {
      assertGlobalPrecondition();
      let response: Response | undefined;
      let body: { code?: string; message?: string } | undefined;
      let sentinelAlive = false;
      try {
        // Anon key only: no Authorization header, login, persisted session or cookie.
        response = await fetch(`${env.apiUrl}/rest/v1/rpc/${row.name!}`, {
          method: "POST",
          headers: { apikey: env.anonKey, "Content-Type": "application/json" },
          body: JSON.stringify(dummyArgs(row)),
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        body = await response.json();
      } finally {
        try {
          sentinelAlive = await sentinel.ping();
        } finally {
          summary.push({
            function: row.signature,
            role: "anon",
            httpStatus: response?.status ?? 0,
            code: body?.code ?? null,
            sentinelAlive,
          });
        }
      }
      expect(response!.status).toBe(400);
      expect(body).toMatchObject({
        code: "P0001",
        message:
          row.name === "upsert_telefun_coaching_summary"
            ? "Access denied: Anonymous users cannot upsert coaching summaries."
            : "Unauthorized",
      });
      expect(
        rowCounts(),
        `No table count may change after ${row.signature}`,
      ).toEqual(before);
    }
    expect(summary).toHaveLength(7);
    expect(summary.every((row) => row.sentinelAlive)).toBe(true);
    await attachJson("group-b-side-effects.json", {
      before,
      after: rowCounts(),
    });
  } finally {
    await attachJson("group-b-rpc-summary.json", summary);
    console.log(
      "Group B",
      JSON.stringify({
        calls: summary.length,
        sentinelAlive: summary.every((row) => row.sentinelAlive),
      }),
    );
    await sentinel.close();
  }
});
