import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

/**
 * Telefun — `GET /telefun/sessions/month-count` pada backend lokal sungguhan.
 *
 * Daftar sesi dibatasi 50 baris, jadi "panggilan bulan ini" di landing harus
 * dihitung server: bulan Asia/Jakarta, cakupan sama dengan daftar sesi
 * (admin/trainer melihat semua pengguna), tidak terpotong 50.
 */

const env = readLoopbackEnv();
const ns = `telefun-month-${randomUUID().slice(0, 8)}`;
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
let trainer: Identity;
let otherTrainer: Identity;
let agent: Identity;
let app: Hono;

async function monthCount(who: Identity) {
  const response = await tnaApiRequest(
    app,
    "http://localhost/api/v1/telefun/sessions/month-count",
    { headers: { Authorization: `Bearer ${who.token}` } },
  );
  return response;
}

async function countAs(who: Identity): Promise<number> {
  const response = await monthCount(who);
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    success: boolean;
    data: { count: number };
  };
  expect(body.success).toBe(true);
  return body.data.count;
}

/** Awal bulan WIB sekarang dan bulan berikutnya, dalam ms UTC. */
function wibMonthBounds(now = Date.now()) {
  const wib = new Date(now + 7 * 3600_000);
  const start =
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - 7 * 3600_000;
  const next =
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() + 1, 1) - 7 * 3600_000;
  return { start, next };
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
  trainer = await createUserWithJwt(env, "trainer", ns);
  otherTrainer = await createUserWithJwt(env, "trainer", `${ns}-b`);
  agent = await createUserWithJwt(env, "agent", ns);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  // Menghapus pengguna ikut menghapus baris telefun_history-nya (cascade).
  for (const identity of [trainer, otherTrainer, agent].filter(Boolean)) {
    expect(
      (await createAdmin(env).auth.admin.deleteUser(identity.userId)).error,
    ).toBeNull();
  }
});

test("counts the whole Jakarta month beyond the 50-row list, for every user, without boundary rows", async () => {
  const { start, next } = wibMonthBounds();
  // Database lokal bisa berisi sesi lain: yang diuji adalah selisihnya.
  const before = await countAs(trainer);

  const row = (userId: string, createdAt: number, title: string) => ({
    user_id: userId,
    scenario_title: title,
    consumer_name: "Konsumen Uji",
    created_at: new Date(createdAt).toISOString(),
  });
  const rows = [
    // 52 milik trainer bulan ini: lebih dari batas daftar 50.
    ...Array.from({ length: 52 }, (_, i) =>
      row(trainer.userId, start + 60_000 + i * 1000, `${ns} bulan ini ${i}`),
    ),
    // Tepat di awal bulan WIB: ikut dihitung.
    row(trainer.userId, start, `${ns} awal bulan`),
    // Trainer lain bulan ini: ikut, sama seperti daftar sesi.
    row(otherTrainer.userId, start + 120_000, `${ns} trainer lain`),
    // Sedetik sebelum bulan ini dan tepat di awal bulan depan: tidak dihitung.
    row(trainer.userId, start - 1000, `${ns} bulan lalu`),
    row(trainer.userId, next, `${ns} bulan depan`),
  ];
  const { error } = await createAdmin(env).from("telefun_history").insert(rows);
  expect(error).toBeNull();

  expect((await countAs(trainer)) - before).toBe(54);
  // Cakupan sama untuk trainer lain.
  expect((await countAs(otherTrainer)) - before).toBe(54);
});

test("an agent's count holds only their own calls", async () => {
  // Telefun is open to agents (2026-10-18); the count is scoped to the caller.
  const before = await countAs(agent);
  const { error } = await createAdmin(env)
    .from("telefun_history")
    .insert({
      user_id: agent.userId,
      scenario_title: `${ns} agen`,
      consumer_name: "Budi",
      created_at: new Date().toISOString(),
    });
  expect(error).toBeNull();
  expect((await countAs(agent)) - before).toBe(1);
  expect(before).toBe(0);
});
