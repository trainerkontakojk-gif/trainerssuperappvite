import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";

/**
 * Profiler photos are uploaded through the API, not from the browser
 * (plans/markdown/profiler-photo-backend-upload.md). The API validates type,
 * bytes, and size, then writes `profiler-foto/<peserta id>/…` with the
 * service role and returns the public URL.
 */

const env = readLoopbackEnv();
installLoopbackFetchGuard();
const suffix = randomUUID();
const BUCKET = "profiler-foto";
// 1×1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG = `data:image/png;base64,${PNG_BASE64}`;
const usedPrefixes: string[] = [];
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  trainer = await createUserWithJwt(env, "trainer", suffix);
  agent = await createUserWithJwt(env, "agent", suffix);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  const storage = createAdmin(env).storage.from(BUCKET);
  for (const prefix of usedPrefixes) {
    const { data } = await storage.list(prefix);
    const paths = (data ?? []).map((item) => `${prefix}/${item.name}`);
    if (paths.length > 0) await storage.remove(paths);
  }
  for (const user of [trainer, agent]) {
    if (!user) continue;
    const result = await createAdmin(env).auth.admin.deleteUser(user.userId);
    if (result.error) throw new Error("fixture auth cleanup failed");
  }
});

function newPesertaId() {
  const id = randomUUID();
  usedPrefixes.push(id);
  return id;
}

function upload(token: string, body: unknown) {
  return app.request("http://localhost/api/v1/profiler/foto", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function objectsUnder(prefix: string) {
  const { data, error } = await createAdmin(env)
    .storage.from(BUCKET)
    .list(prefix);
  expect(error).toBeNull();
  return data ?? [];
}

test("trainer uploads a photo through the API and gets its public URL", async () => {
  const pesertaId = newPesertaId();
  const response = await upload(trainer.token, {
    peserta_id: pesertaId,
    image: PNG,
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: { url: string } };
  const prefix = `${env.apiUrl}/storage/v1/object/public/${BUCKET}/${pesertaId}/`;
  expect(body.data.url.startsWith(prefix)).toBe(true);
  expect(body.data.url).toMatch(/\/\d+-[0-9a-f-]{36}\.png$/);

  const stored = await fetch(body.data.url);
  expect(stored.status).toBe(200);
  expect(stored.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await stored.arrayBuffer())).toEqual(
    Buffer.from(PNG_BASE64, "base64"),
  );
});

test("a role without profiler.write cannot upload", async () => {
  const pesertaId = newPesertaId();
  const response = await upload(agent.token, {
    peserta_id: pesertaId,
    image: PNG,
  });
  expect(response.status).toBe(403);
  expect(await objectsUnder(pesertaId)).toEqual([]);
});

const OVERSIZE = `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1, 1).toString("base64")}`;

for (const [name, image] of [
  [
    "an SVG",
    `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
  ],
  [
    "text declared as PNG",
    `data:image/png;base64,${Buffer.from("not an image").toString("base64")}`,
  ],
  ["a PNG declared as JPEG", `data:image/jpeg;base64,${PNG_BASE64}`],
  ["a file over 5 MB", OVERSIZE],
  ["a plain URL instead of a data URL", "https://example.test/avatar.png"],
] as const) {
  test(`rejects ${name} without writing to Storage`, async () => {
    const pesertaId = newPesertaId();
    const response = await upload(trainer.token, {
      peserta_id: pesertaId,
      image,
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/foto/i);
    expect(await objectsUnder(pesertaId)).toEqual([]);
  });
}

test("rejects a peserta id that is not a UUID", async () => {
  const response = await upload(trainer.token, {
    peserta_id: "../escape",
    image: PNG,
  });
  expect(response.status).toBe(400);
  expect(await objectsUnder("escape")).toEqual([]);
});
