import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";

const env = readLoopbackEnv();
installLoopbackFetchGuard();
const suffix = randomUUID();
const batch = `e2e-import-${suffix}`;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;

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
  trainer = await createUserWithJwt(env, "trainer", suffix);
  runSql(env, `INSERT INTO profiler_folders(name) VALUES ('${batch}')`);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  runSql(
    env,
    `DELETE FROM profiler_peserta WHERE batch_name='${batch}'; DELETE FROM profiler_folders WHERE name='${batch}';`,
  );
  if (trainer) {
    const result = await createAdmin(env).auth.admin.deleteUser(trainer.userId);
    if (result.error) throw new Error("fixture auth cleanup failed");
  }
});

test("bulk import persists supported optional participant fields", async () => {
  const item = {
    batch_name: batch,
    nama: "E2E Peserta",
    tim: "Chat",
    jabatan: "cca",
    nik_ojk: "TEST-001",
    tgl_lahir: "1999-01-02",
    email_ojk: "test@local.test",
    no_telepon_darurat: "00001",
    nama_kontak_darurat: "E2E kontak",
    hubungan_kontak_darurat: "keluarga",
    catatan_tambahan: "E2E catatan",
  };
  const response = await app.request(
    "http://localhost/api/v1/profiler/peserta/bulk",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${trainer.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ items: [item] }),
    },
  );
  expect(response.status).toBe(201);
  const { data, error } = await createAdmin(env)
    .from("profiler_peserta")
    .select("*")
    .eq("batch_name", batch)
    .single();
  expect(error).toBeNull();
  expect(data).toMatchObject(item);
});

test("bulk import returns only inserted rows when another participant already exists", async () => {
  const { error: seedError } = await createAdmin(env)
    .from("profiler_peserta")
    .insert({
      batch_name: batch,
      nama: "E2E Ada",
      tim: "Chat",
      jabatan: "cca",
    });
  expect(seedError).toBeNull();
  const response = await app.request(
    "http://localhost/api/v1/profiler/peserta/bulk",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${trainer.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        items: [
          { batch_name: batch, nama: "E2E Ada", tim: "Chat", jabatan: "cca" },
          { batch_name: batch, nama: "E2E Baru", tim: "Chat", jabatan: "cca" },
        ],
      }),
    },
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: Array<{ nama: string }> };
  expect(body.data.map((item) => item.nama)).toEqual(["E2E Baru"]);
  const { count, error } = await createAdmin(env)
    .from("profiler_peserta")
    .select("id", { count: "exact", head: true })
    .eq("batch_name", batch)
    .in("nama", ["E2E Ada", "E2E Baru"]);
  expect(error).toBeNull();
  expect(count).toBe(2);
});
