import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import type { Hono } from "hono";
import { hc } from "hono/client";
import type { KetikRouteType } from "../../api/src/app";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const ns = `ketik-assignment-${randomUUID().slice(0, 8)}`;
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
const users = new Map<string, Identity>();
let app: Hono;
const marker = "e2e-private-assignment-database-detail";
const triggerName = `e2e_${ns.replaceAll("-", "_")}`;
function fixtureSql(query: string) {
  try {
    return runSql(env, query);
  } catch {
    throw new Error(
      "Loopback assignment fixture SQL failed (connection details withheld)",
    );
  }
}
const source = {
  ...structuredClone(DEFAULT_KETIK_SETTINGS),
  scenarios: [
    ...DEFAULT_KETIK_SETTINGS.scenarios.map((scenario) => ({
      ...scenario,
      isActive: false,
    })),
    {
      id: ns,
      category: "E2E",
      title: "Sumber trainer",
      description: "Konfigurasi penugasan E2E.",
      isActive: true,
    },
  ],
  identitySettings: {
    displayName: "Privat trainer",
    signatureName: "Privat",
    city: "Privat",
    phoneNumber: "080000001",
  },
  quickTemplates: [
    { id: ns, keyword: "privat", content: "Template privat trainer" },
  ],
};

async function api(
  identity: Identity,
  path: string,
  method = "GET",
  body?: unknown,
) {
  return tnaApiRequest(app, `http://localhost/api/v1/ketik${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${identity.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function settings(identity: Identity) {
  const response = await api(identity, "/settings");
  expect(response.status).toBe(200);
  return {
    version: response.headers.get("x-settings-version")!,
    data: (await response.json()).data,
  };
}

async function assignment(identity: Identity, recipient = identity) {
  const response = await api(
    identity,
    `/assignments/${recipient === identity ? "self" : recipient.userId}`,
  );
  expect(response.status).toBe(200);
  return (await response.json()).data;
}

async function assignmentBody(actor: Identity, recipient: Identity) {
  const target = await assignment(actor, recipient);
  return {
    sourceSettingsVersion: (await settings(actor)).version,
    recipientSettingsVersion: target.recipientSettingsVersion,
    expectedAssignmentVersion: target.assignment?.version ?? null,
  };
}

async function assign(actor: Identity, recipient: Identity) {
  // The repository scopes deeply nested RPC groups to avoid AppType depth limits.
  const fetchBridge: typeof fetch = (input, init) =>
    tnaApiRequest(app, input, init ?? {});
  const client = hc<KetikRouteType>("http://localhost/api/v1/ketik", {
    headers: { Authorization: `Bearer ${actor.token}` },
    fetch: fetchBridge,
  });
  const response = await client.assignments[":recipientId"].$put({
    param: { recipientId: recipient.userId },
    json: await assignmentBody(actor, recipient),
  });
  expect(response.status).toBe(200);
  const result = await response.json();
  if (!("data" in result) || !result.data)
    throw new Error("Typed assignment RPC rejected");
  return result.data;
}

function userClient(identity: Identity) {
  return createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${identity.token}` } },
  });
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  for (const role of ["trainer", "admin", "agent", "leader"] as const)
    users.set(role, await createUserWithJwt(env, role, ns));
  users.set(
    "otherTrainer",
    await createUserWithJwt(env, "trainer", `${ns}-other`),
  );
  users.set("newAgent", await createUserWithJwt(env, "agent", `${ns}-fresh`));
  for (const [role, identity] of users) {
    if (role === "newAgent") continue;
    const inserted = await createAdmin(env)
      .from("user_settings")
      .insert({
        user_id: identity.userId,
        settings: {
          pdkt: { preserved: ns },
          ketik:
            role === "trainer"
              ? source
              : {
                  ...structuredClone(DEFAULT_KETIK_SETTINGS),
                  identitySettings: {
                    displayName: role,
                    signatureName: role,
                    city: "Bandung",
                    phoneNumber: "080000002",
                  },
                  quickTemplates: [
                    {
                      id: `${ns}-${role}`,
                      keyword: "pribadi",
                      content: "Template pribadi",
                    },
                  ],
                },
        },
      });
    expect(inserted.error).toBeNull();
  }
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
});

test.afterAll(async () => {
  // CASCADE is limited to this run's uniquely named fixture function/trigger.
  fixtureSql(`DROP FUNCTION IF EXISTS public.${triggerName}() CASCADE;`);
  for (const identity of users.values()) {
    const deleted = await createAdmin(env).auth.admin.deleteUser(
      identity.userId,
    );
    expect(deleted.error).toBeNull();
  }
});

test("assignment copies server settings, preserves private data, and personal edits never change the source", async () => {
  const trainer = users.get("trainer")!;
  const agent = users.get("agent")!;
  expect((await assignment(agent)).assignment).toBeNull();
  const before = await settings(agent);
  const assigned = await assign(trainer, agent);
  expect(assigned.assignment).toMatchObject({
    recipientId: agent.userId,
    assignedBy: trainer.userId,
    sourceConfiguration: { scenarios: source.scenarios },
  });
  expect(assigned.assignment.sourceConfiguration).not.toHaveProperty(
    "identitySettings",
  );
  expect(assigned.assignment.sourceConfiguration).not.toHaveProperty(
    "quickTemplates",
  );
  expect(assigned.assignment.sourceConfiguration).not.toHaveProperty(
    "personalQuickTemplates",
  );
  const copy = await settings(agent);
  expect(copy.data.scenarios).toEqual(source.scenarios);
  expect(copy.data.identitySettings).toEqual(before.data.identitySettings);
  expect(copy.data.personalQuickTemplates).toEqual(
    before.data.personalQuickTemplates,
  );
  const saved = await api(agent, "/settings", "PUT", {
    ...copy.data,
    scenarios: source.scenarios.map((scenario, index) =>
      index === 0 ? { ...scenario, title: "Salinan pribadi" } : scenario,
    ),
    selectedModel: "gpt-5.4-mini",
  });
  expect(saved.status).toBe(200);
  const edited = await settings(agent);
  expect(edited.data.scenarios[0].title).toBe("Salinan pribadi");
  expect(edited.data.selectedModel).toBe("gpt-5.4-mini");
  expect((await settings(trainer)).data.scenarios).toEqual(source.scenarios);
  expect(
    (await assignment(agent)).assignment.sourceConfiguration.scenarios,
  ).toEqual(source.scenarios);
  const stored = await createAdmin(env)
    .from("user_settings")
    .select("settings")
    .eq("user_id", agent.userId)
    .single();
  expect(stored.error).toBeNull();
  expect(stored.data!.settings.pdkt).toEqual({ preserved: ns });
});

test("leader can edit its own copy; subsequent trainer edits do not propagate silently", async () => {
  const trainer = users.get("trainer")!;
  const leader = users.get("leader")!;
  expect((await assignment(leader)).assignment).toBeNull();
  await assign(trainer, leader);
  const copied = await settings(leader);
  expect(
    (
      await api(leader, "/settings", "PUT", {
        ...copied.data,
        simulationDuration: 8,
      })
    ).status,
  ).toBe(200);
  const original = await settings(trainer);
  expect(
    (
      await api(trainer, "/settings", "PUT", {
        ...original.data,
        simulationDuration: 9,
      })
    ).status,
  ).toBe(200);
  expect((await settings(leader)).data.simulationDuration).toBe(8);
  expect(
    (await assignment(leader)).assignment.sourceConfiguration
      .simulationDuration,
  ).toBe(original.data.simulationDuration);
  expect((await settings(trainer)).data.simulationDuration).toBe(9);
});

test("role and assignment ownership are enforced, including administrative reassignment", async () => {
  const trainer = users.get("trainer")!;
  const agent = users.get("agent")!;
  const leader = users.get("leader")!;
  const otherTrainer = users.get("otherTrainer")!;
  for (const actor of [agent, leader]) {
    expect((await api(actor, `/assignments/${trainer.userId}`)).status).toBe(
      403,
    );
    expect(
      (
        await api(actor, `/assignments/${leader.userId}`, "PUT", {
          sourceSettingsVersion: "absent",
          recipientSettingsVersion: "absent",
          expectedAssignmentVersion: null,
        })
      ).status,
    ).toBe(403);
  }
  expect((await api(otherTrainer, `/assignments/${agent.userId}`)).status).toBe(
    403,
  );
  const body = await assignmentBody(trainer, agent);
  expect(
    (
      await api(otherTrainer, `/assignments/${agent.userId}`, "PUT", {
        ...body,
        sourceSettingsVersion: (await settings(otherTrainer)).version,
      })
    ).status,
  ).toBe(403);
  const admin = users.get("admin")!;
  expect((await assign(admin, leader)).assignment.assignedBy).toBe(
    admin.userId,
  );
  expect((await api(trainer, `/assignments/${leader.userId}`)).status).toBe(
    403,
  );
  expect((await assignment(agent)).assignment.assignedBy).toBe(trainer.userId);
});

test("strict input and recipient validation never accept client-supplied source data", async () => {
  const trainer = users.get("trainer")!;
  const agent = users.get("agent")!;
  const body = await assignmentBody(trainer, agent);
  for (const invalid of [
    { ...body, configuration: source },
    { ...body, assignedBy: users.get("admin")!.userId },
    { sourceSettingsVersion: body.sourceSettingsVersion },
    { ...body, expectedAssignmentVersion: "not-a-uuid" },
    { ...body, recipientSettingsVersion: "not-a-version" },
  ])
    expect(
      (await api(trainer, `/assignments/${agent.userId}`, "PUT", invalid))
        .status,
    ).toBe(400);
  expect(
    (await api(trainer, "/assignments/not-a-uuid", "PUT", body)).status,
  ).toBe(400);
  for (const invalidId of [
    trainer.userId,
    users.get("admin")!.userId,
    randomUUID(),
  ]) {
    const response = await api(
      trainer,
      `/assignments/${invalidId}`,
      "PUT",
      body,
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe(
      "ASSIGNMENT_INVALID_RECIPIENT",
    );
  }
  const leader = users.get("leader")!;
  const admin = users.get("admin")!;
  const inactiveBody = await assignmentBody(admin, leader);
  const disabled = await createAdmin(env)
    .from("profiles")
    .update({ status: "inactive" })
    .eq("id", leader.userId);
  expect(disabled.error).toBeNull();
  try {
    expect(
      (await api(admin, `/assignments/${leader.userId}`, "PUT", inactiveBody))
        .status,
    ).toBe(404);
  } finally {
    const enabled = await createAdmin(env)
      .from("profiles")
      .update({ status: "active" })
      .eq("id", leader.userId);
    expect(enabled.error).toBeNull();
  }
});

test("source, recipient, and assignment version conflicts cannot overwrite newer settings", async () => {
  const trainer = users.get("trainer")!;
  const agent = users.get("agent")!;
  const url = `/assignments/${agent.userId}`;
  const staleSource = await assignmentBody(trainer, agent);
  const oldSource = await settings(trainer);
  expect(
    (
      await api(trainer, "/settings", "PUT", {
        ...oldSource.data,
        simulationDuration: 10,
      })
    ).status,
  ).toBe(200);
  expect((await api(trainer, url, "PUT", staleSource)).status).toBe(409);
  const staleRecipient = await assignmentBody(trainer, agent);
  const oldCopy = await settings(agent);
  expect(
    (
      await api(agent, "/settings", "PUT", {
        ...oldCopy.data,
        simulationDuration: 11,
      })
    ).status,
  ).toBe(200);
  const current = await settings(agent);
  const priorAssignment = await assignment(agent);
  expect((await api(trainer, url, "PUT", staleRecipient)).status).toBe(409);
  const fresh = await assignmentBody(trainer, agent);
  for (const version of [null, randomUUID()]) {
    const conflict = await api(trainer, url, "PUT", {
      ...fresh,
      expectedAssignmentVersion: version,
    });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("ASSIGNMENT_CONFLICT");
  }
  expect(await settings(agent)).toEqual(current);
  expect(await assignment(agent)).toEqual(priorAssignment);
});

test("competing assignments with the same versions publish exactly one copy", async () => {
  const trainer = users.get("trainer")!;
  for (const key of ["agent", "newAgent"]) {
    const recipient = users.get(key)!;
    const body = await assignmentBody(trainer, recipient);
    if (key === "newAgent") {
      expect(body.expectedAssignmentVersion).toBeNull();
      expect(body.recipientSettingsVersion).toBe("absent");
    }
    // Two requests inside ONE serial test runner, to exercise the database lock.
    const responses = await Promise.all([
      api(trainer, `/assignments/${recipient.userId}`, "PUT", body),
      api(trainer, `/assignments/${recipient.userId}`, "PUT", body),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const copy = await settings(recipient);
    expect(copy.data.simulationDuration).toBe(
      (await settings(trainer)).data.simulationDuration,
    );
    expect((await assignment(recipient)).assignment.version).not.toBe(
      body.expectedAssignmentVersion,
    );
  }
});

test("an invalid source is rejected before changing a personal copy", async () => {
  const trainer = users.get("trainer")!;
  const agent = users.get("agent")!;
  const original = await settings(trainer);
  const copy = await settings(agent);
  try {
    for (const invalid of [
      {
        ...original.data,
        scenarios: original.data.scenarios.map(
          (scenario: { isActive: boolean }) => ({
            ...scenario,
            isActive: false,
          }),
        ),
      },
      { ...original.data, activeConsumerTypeId: "missing-consumer" },
    ]) {
      expect((await api(trainer, "/settings", "PUT", invalid)).status).toBe(
        200,
      );
      const response = await api(
        trainer,
        `/assignments/${agent.userId}`,
        "PUT",
        await assignmentBody(trainer, agent),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(
        "ASSIGNMENT_INVALID_CONFIGURATION",
      );
      expect(await settings(agent)).toEqual(copy);
    }
  } finally {
    expect((await api(trainer, "/settings", "PUT", original.data)).status).toBe(
      200,
    );
  }
});

test("authenticated users cannot forge assignments or execute the backend-only transaction", async () => {
  const agent = users.get("agent")!;
  const ownAssignment = (await assignment(agent)).assignment;
  for (const [role, identity] of users) {
    const client = userClient(identity);
    const visible = await client
      .from("ketik_configuration_assignments")
      .select("recipient_id")
      .eq("recipient_id", agent.userId);
    expect(visible.error).toBeNull();
    expect(visible.data).toHaveLength(
      role === "agent" || role === "trainer" ? 1 : 0,
    );
    const inserted = await client
      .from("ketik_configuration_assignments")
      .insert({
        recipient_id: agent.userId,
        assigned_by: identity.userId,
        source_configuration: {},
        source_settings_version: "absent",
      });
    expect(inserted.error?.code).toBe("42501");
    const updated = await client
      .from("ketik_configuration_assignments")
      .update({ assigned_by: identity.userId })
      .eq("recipient_id", agent.userId);
    expect(updated.error?.code).toBe("42501");
    const removed = await client
      .from("ketik_configuration_assignments")
      .delete()
      .eq("recipient_id", agent.userId);
    expect(removed.error?.code).toBe("42501");
    const rpc = await client.rpc("assign_ketik_configuration", {
      p_actor_id: users.get("admin")!.userId,
      p_recipient_id: agent.userId,
      p_source_settings_version: "absent",
      p_recipient_settings_version: "absent",
      p_expected_assignment_version: null,
      p_configuration: {},
    });
    expect(rpc.error?.code).toBe("42501");
  }
  expect((await assignment(agent)).assignment).toEqual(ownAssignment);
});

test("transaction publication failure rolls back both settings and assignment without leaking details", async () => {
  const trainer = users.get("trainer")!;
  const agent = users.get("agent")!;
  const before = await createAdmin(env)
    .from("user_settings")
    .select("settings, updated_at")
    .eq("user_id", agent.userId)
    .single();
  expect(before.error).toBeNull();
  const beforeAssignment = await assignment(agent);
  const body = await assignmentBody(trainer, agent);
  fixtureSql(`
    CREATE FUNCTION public.${triggerName}() RETURNS trigger LANGUAGE plpgsql
      SECURITY INVOKER SET search_path = public, pg_temp AS $$
      BEGIN RAISE EXCEPTION '${marker}'; END; $$;
    REVOKE ALL ON FUNCTION public.${triggerName}() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.${triggerName}() TO service_role;
    CREATE TRIGGER ${triggerName} BEFORE INSERT OR UPDATE ON public.ketik_configuration_assignments
      FOR EACH ROW WHEN (NEW.recipient_id = '${agent.userId}'::uuid)
      EXECUTE FUNCTION public.${triggerName}();
  `);
  try {
    const response = await api(
      trainer,
      `/assignments/${agent.userId}`,
      "PUT",
      body,
    );
    expect(response.status).toBe(500);
    const publicBody = await response.json();
    expect(publicBody.error.code).toBe("ASSIGNMENT_SAVE_FAILED");
    expect(JSON.stringify(publicBody)).not.toContain(marker);
    const after = await createAdmin(env)
      .from("user_settings")
      .select("settings, updated_at")
      .eq("user_id", agent.userId)
      .single();
    expect(after.error).toBeNull();
    expect(after.data).toEqual(before.data);
    expect(await assignment(agent)).toEqual(beforeAssignment);
  } finally {
    fixtureSql(`DROP FUNCTION public.${triggerName}() CASCADE;`);
  }
});

test("database transport failures are errors, never an unassigned success or raw error", async () => {
  const agent = users.get("agent")!;
  const trainer = users.get("trainer")!;
  const body = await assignmentBody(trainer, agent);
  const guardedFetch = globalThis.fetch;
  let failedPath = "/rest/v1/ketik_configuration_assignments";
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname === failedPath
    )
      return Response.json({ code: "XX000", message: marker }, { status: 500 });
    return guardedFetch(input, init);
  };
  try {
    for (const path of [
      "/rest/v1/ketik_configuration_assignments",
      "/rest/v1/user_settings",
    ]) {
      failedPath = path;
      const response = await api(agent, "/assignments/self");
      expect(response.status).toBe(500);
      const publicBody = await response.json();
      expect(publicBody.error.code).toBe("ASSIGNMENT_LOAD_FAILED");
      expect(JSON.stringify(publicBody)).not.toContain(marker);
    }
    failedPath = "/rest/v1/rpc/assign_ketik_configuration";
    const response = await api(
      trainer,
      `/assignments/${agent.userId}`,
      "PUT",
      body,
    );
    expect(response.status).toBe(500);
    const publicBody = await response.json();
    expect(publicBody.error.code).toBe("ASSIGNMENT_SAVE_FAILED");
    expect(JSON.stringify(publicBody)).not.toContain(marker);
  } finally {
    globalThis.fetch = guardedFetch;
  }
});

test("the SQL transaction rechecks source revision after the service has read it", async () => {
  const trainer = users.get("trainer")!;
  const agent = users.get("agent")!;
  const body = await assignmentBody(trainer, agent);
  const beforeCopy = await settings(agent);
  const beforeAssignment = (await assignment(agent)).assignment;
  const sourceBefore = await settings(trainer);
  const guardedFetch = globalThis.fetch;
  let entered!: () => void;
  let release!: () => void;
  const reachedRpc = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname === "/rest/v1/rpc/assign_ketik_configuration"
    ) {
      entered();
      await released;
    }
    return guardedFetch(input, init);
  };
  const pending = api(trainer, `/assignments/${agent.userId}`, "PUT", body);
  try {
    await reachedRpc;
    expect(
      (
        await api(trainer, "/settings", "PUT", {
          ...sourceBefore.data,
          simulationDuration: sourceBefore.data.simulationDuration + 1,
        })
      ).status,
    ).toBe(200);
    release();
    expect((await pending).status).toBe(409);
  } finally {
    release();
    globalThis.fetch = guardedFetch;
    await pending;
  }
  expect(await settings(agent)).toEqual(beforeCopy);
  expect((await assignment(agent)).assignment).toEqual(beforeAssignment);
});

test("an explicit assignment can use a source with no saved settings without copying private defaults", async () => {
  const admin = users.get("admin")!;
  const recipient = users.get("newAgent")!;
  const db = createAdmin(env);
  const original = await db
    .from("user_settings")
    .select("*")
    .eq("user_id", admin.userId)
    .single();
  expect(original.error).toBeNull();
  const removed = await db
    .from("user_settings")
    .delete()
    .eq("user_id", admin.userId);
  expect(removed.error).toBeNull();
  try {
    expect((await settings(admin)).version).toBe("absent");
    const assigned = await assign(admin, recipient);
    expect(assigned.assignment.sourceSettingsVersion).toBe("absent");
    expect(assigned.assignment.sourceConfiguration.scenarios).toEqual(
      DEFAULT_KETIK_SETTINGS.scenarios,
    );
    expect(assigned.assignment.sourceConfiguration).not.toHaveProperty(
      "identitySettings",
    );
  } finally {
    const restored = await db.from("user_settings").insert(original.data!);
    expect(restored.error).toBeNull();
  }
});
