import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

const env = readLoopbackEnv();
const title = "Bukti transfer cicilan";
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;

function settingsWithAlt(alt: string) {
  return {
    ...DEFAULT_KETIK_SETTINGS,
    scenarios: [
      {
        ...DEFAULT_KETIK_SETTINGS.scenarios[0],
        title,
        images: ["/fixture/first.png", "/fixture/second.png"],
        imageAlts: ["Gambar pertama", alt],
      },
    ],
  };
}

function settingsRequest(body?: unknown, version?: string) {
  return tnaApiRequest(app, "http://localhost/api/v1/ketik/settings", {
    method: body === undefined ? "GET" : "PUT",
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      "Content-Type": "application/json",
      ...(version ? { "x-settings-version": version } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  trainer = await createUserWithJwt(
    env,
    "trainer",
    `ketik-image-alt-${randomUUID().slice(0, 8)}`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
});

test.afterAll(async () => {
  if (!trainer) return;
  expect(
    (await createAdmin(env).auth.admin.deleteUser(trainer.userId)).error,
  ).toBeNull();
});

test("KETIK image description saves and round-trips up to 2000 characters", async () => {
  const initial = await settingsRequest();
  expect(initial.status).toBe(200);
  let version = initial.headers.get("x-settings-version");

  for (const length of [1500, 2000]) {
    const description = "Rincian transfer\n".padEnd(length - 1, "a") + ".";
    expect(version).toBeTruthy();
    const saved = await settingsRequest(settingsWithAlt(description), version!);
    expect(saved.status, `saving ${length} characters`).toBe(200);

    const loaded = await settingsRequest();
    expect(loaded.status).toBe(200);
    expect((await loaded.json()).data.scenarios[0].imageAlts).toEqual([
      "Gambar pertama",
      description,
    ]);
    version = loaded.headers.get("x-settings-version");
  }
});

test("KETIK image description over 2000 characters names the scenario and image", async () => {
  const rejected = await settingsRequest(settingsWithAlt("a".repeat(2001)));
  expect(rejected.status).toBe(400);
  const response = await rejected.json();
  expect(response).toEqual({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: `Keterangan gambar #1 pada skenario "${title}" melebihi 2000 karakter.`,
    },
  });
  expect(JSON.stringify(response)).not.toMatch(/"origin"|"too_big"/);
});

test("KETIK image description settings route uses a generic message for other invalid fields", async () => {
  const rejected = await settingsRequest({
    ...DEFAULT_KETIK_SETTINGS,
    scenarios: null,
  });
  expect(rejected.status).toBe(400);
  expect(await rejected.json()).toEqual({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Pengaturan KETIK tidak valid. Periksa kembali isian Anda.",
    },
  });
});
