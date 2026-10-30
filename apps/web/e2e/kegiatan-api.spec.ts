import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  type LoopbackEnv,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

/** This spec gets its credentials from this worktree's running local stack. */
function readLocalSupabaseEnv(): LoopbackEnv {
  const root = new URL("../../..", import.meta.url).pathname;
  let status: Record<string, string>;
  try {
    status = JSON.parse(
      execFileSync("supabase", ["status", "--output", "json"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ) as Record<string, string>;
  } catch {
    throw new Error(
      "Supabase lokal tidak dapat diverifikasi dari harness E2E.",
    );
  }

  const apiUrl = status.API_URL;
  const dbUrl = status.DB_URL;
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;
  if (!apiUrl || !dbUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Environment Supabase lokal dari Playwright tidak lengkap.",
    );
  }
  const loopback = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (
    !loopback.has(new URL(apiUrl).hostname) ||
    !loopback.has(new URL(dbUrl).hostname)
  ) {
    throw new Error("E2E Kegiatan hanya boleh memakai Supabase loopback.");
  }
  return { apiUrl, dbUrl, anonKey, serviceRoleKey };
}

type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
type ActivityInput = {
  year: number;
  program: "sobat" | "ketik" | "telefun" | "pdkt" | "ceriwis";
  kind: "poster" | "foto";
  title: string;
  event_date: string | null;
  drive_url: string;
  sort_order: number;
  is_published: boolean;
  image?: string;
  image_url?: string;
  created_by?: string;
  updated_by?: string | null;
};

const env = readLocalSupabaseEnv();
const namespace = `kegiatan-e2e-${randomUUID().slice(0, 8)}`;
const bucketName = "trainer-activity-media";
const roles = ["admin", "trainer", "leader", "agent"] as const;
const users: Partial<Record<(typeof roles)[number], Identity>> = {};
const uploadedObjects = new Set<string>();
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
let app: Hono;

function imageData(label: string): string {
  const bytes = Buffer.concat([
    Buffer.from(PNG_BASE64, "base64"),
    Buffer.from(`${namespace}-${label}`),
  ]);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function input(
  title: string,
  overrides: Partial<ActivityInput> = {},
): ActivityInput {
  return {
    year: 2026,
    program: "sobat",
    kind: "poster",
    title: `${namespace}-${title}`,
    event_date: "2026-09-29",
    drive_url: "https://drive.google.com/file/d/kegiatan-e2e/view",
    sort_order: 0,
    is_published: true,
    image: imageData(title),
    ...overrides,
  };
}

function trackImageUrl(value: string): void {
  const marker = `/object/public/${bucketName}/`;
  const pathname = new URL(value).pathname;
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex >= 0)
    uploadedObjects.add(
      decodeURIComponent(pathname.slice(markerIndex + marker.length)),
    );
}

async function api(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return tnaApiRequest(app, `http://localhost${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

async function expectFriendlyError(response: Response, expectedText: string) {
  expect(response.status).toBe(400);
  const json = await response.json();
  const message = json.error?.message;
  expect(message).toContain(expectedText);
  expect(message).not.toMatch(
    /postgrest|violates|invalid input syntax|duplicate key/i,
  );
}

test.describe.configure({ mode: "default" });
test.setTimeout(120_000);

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
  for (const role of roles)
    users[role] = await createUserWithJwt(env, role, namespace);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  const admin = createAdmin(env);
  // The first RED run happens before the migration, so an absent table is an
  // expected cleanup condition. Once present, remove only this run's fixtures.
  const { error: rowsError } = await admin
    .from("trainer_activities")
    .delete()
    .like("title", `${namespace}%`);
  if (
    rowsError &&
    !/trainer_activities|schema cache|does not exist/i.test(rowsError.message)
  )
    throw rowsError;

  if (uploadedObjects.size > 0) {
    const { error } = await admin.storage
      .from(bucketName)
      .remove([...uploadedObjects]);
    if (error && !/bucket|not found|does not exist/i.test(error.message))
      throw error;
  }
  for (const role of [...roles].reverse()) {
    const user = users[role];
    if (!user) continue;
    const { error } = await admin.auth.admin.deleteUser(user.userId);
    if (error) throw error;
  }
});

test("admin dan trainer bisa membuat, mengubah, menyembunyikan, dan menghapus kegiatan", async () => {
  for (const role of ["admin", "trainer"] as const) {
    const identity = users[role]!;
    const createBody = input(`${role}-crud`, {
      created_by: users.leader!.userId,
      updated_by: users.leader!.userId,
    });
    const created = await api("/api/v1/kegiatan", {
      method: "POST",
      token: identity.token,
      body: createBody,
    });
    expect(created.status).toBe(201);
    const createdJson = await created.json();
    expect(createdJson.success).toBe(true);
    expect(createdJson.data).toMatchObject({
      created_by: identity.userId,
      updated_by: null,
    });
    trackImageUrl(createdJson.data.image_url);

    const listed = await api("/api/v1/kegiatan?tahun=2026", {
      token: identity.token,
    });
    expect(listed.status).toBe(200);
    expect(
      (await listed.json()).data.map((row: { id: string }) => row.id),
    ).toContain(createdJson.data.id);

    const updateBody: ActivityInput = {
      ...createBody,
      title: `${createBody.title}-ubah`,
      image: undefined,
      image_url: createdJson.data.image_url,
      is_published: false,
    };
    const updated = await api(`/api/v1/kegiatan/${createdJson.data.id}`, {
      method: "PATCH",
      token: identity.token,
      body: updateBody,
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).data).toMatchObject({
      title: updateBody.title,
      is_published: false,
      created_by: identity.userId,
      updated_by: identity.userId,
    });

    const publicItems = await api("/api/public/kegiatan?tahun=2026");
    expect(publicItems.status).toBe(200);
    expect(
      (await publicItems.json()).data.items.map(
        (row: { id: string }) => row.id,
      ),
    ).not.toContain(createdJson.data.id);

    const removed = await api(`/api/v1/kegiatan/${createdJson.data.id}`, {
      method: "DELETE",
      token: identity.token,
    });
    expect(removed.status).toBe(200);
    expect((await removed.json()).success).toBe(true);
  }
});

test("leader, agent, dan tamu ditolak dari endpoint admin", async () => {
  for (const role of ["leader", "agent"] as const) {
    const denied = await api("/api/v1/kegiatan", { token: users[role]!.token });
    expect(denied.status).toBe(403);
  }
  const guest = await api("/api/v1/kegiatan");
  expect(guest.status).toBe(401);
});

test("API publik hanya mengembalikan item terbit, urut, dan daftar tahunnya", async () => {
  const identity = users.admin!;
  const items = [
    input("public-2025", { year: 2025, sort_order: 0 }),
    input("public-2026-late", { program: "ketik", sort_order: 20 }),
    input("public-2026-first", { program: "ketik", sort_order: 10 }),
    input("private-2027", { year: 2027, is_published: false }),
  ];
  for (const item of items) {
    const response = await api("/api/v1/kegiatan", {
      method: "POST",
      token: identity.token,
      body: item,
    });
    expect(response.status).toBe(201);
    const json = await response.json();
    trackImageUrl(json.data.image_url);
  }

  const latest = await api("/api/public/kegiatan");
  expect(latest.status).toBe(200);
  expect(latest.headers.get("cache-control")).toContain("public");
  expect(latest.headers.get("cache-control")).toContain("max-age=60");
  const data = (await latest.json()).data;
  expect(data).toMatchObject({ years: [2026, 2025], year: 2026 });
  expect(data.items.map((row: { title: string }) => row.title)).toEqual([
    `${namespace}-public-2026-first`,
    `${namespace}-public-2026-late`,
  ]);
  expect(JSON.stringify(data.items)).not.toContain(`${namespace}-private-2027`);
  expect(data.items[0]).not.toHaveProperty("created_by");
  expect(data.items[0]).not.toHaveProperty("is_published");

  const emptyYear = await api("/api/public/kegiatan?tahun=2030");
  expect(emptyYear.status).toBe(200);
  expect((await emptyYear.json()).data).toMatchObject({
    years: [2026, 2025],
    year: 2030,
    items: [],
  });
});

test("link selain Google Drive dan gambar di luar PNG/JPEG/WebP 5 MB ditolak dengan pesan manusiawi", async () => {
  const identity = users.admin!;
  const invalidDrive = await api("/api/v1/kegiatan", {
    method: "POST",
    token: identity.token,
    body: input("bad-drive", { drive_url: "https://example.com/file" }),
  });
  await expectFriendlyError(invalidDrive, "Google Drive");

  const invalidType = await api("/api/v1/kegiatan", {
    method: "POST",
    token: identity.token,
    body: input("bad-type", {
      image:
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    }),
  });
  await expectFriendlyError(invalidType, "PNG, JPEG, atau WebP");

  const oversized = await api("/api/v1/kegiatan", {
    method: "POST",
    token: identity.token,
    body: input("too-large", {
      image: `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")}`,
    }),
  });
  await expectFriendlyError(oversized, "5 MB");
});

function solidPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([200, 60, (x * 7) % 256], 1 + x * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Reads the canvas size from a RIFF/WebP header (VP8, VP8L, or VP8X). */
function webpSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8 ")
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  if (kind === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  expect(kind).toBe("VP8X");
  return {
    width: bytes.readUIntLE(24, 3) + 1,
    height: bytes.readUIntLE(27, 3) + 1,
  };
}

test("gambar unggahan disimpan sebagai WebP maksimal 800 px dan gambar rusak ditolak", async () => {
  const identity = users.admin!;
  const original = solidPng(1600, 2000);
  const created = await api("/api/v1/kegiatan", {
    method: "POST",
    token: identity.token,
    body: input("optimized", {
      image: `data:image/png;base64,${original.toString("base64")}`,
    }),
  });
  expect(created.status).toBe(201);
  const imageUrl: string = (await created.json()).data.image_url;
  trackImageUrl(imageUrl);
  expect(imageUrl).toMatch(/\.webp$/);

  const stored = await fetch(imageUrl);
  expect(stored.status).toBe(200);
  expect(stored.headers.get("content-type")).toBe("image/webp");
  const bytes = Buffer.from(await stored.arrayBuffer());
  expect(bytes.length).toBeLessThan(original.length);
  expect(webpSize(bytes)).toEqual({ width: 800, height: 1000 });

  const corrupt = await api("/api/v1/kegiatan", {
    method: "POST",
    token: identity.token,
    body: input("corrupt", {
      image: `data:image/png;base64,${Buffer.from(`${namespace}-not-an-image`).toString("base64")}`,
    }),
  });
  await expectFriendlyError(corrupt, "Gambar tidak valid");
});

test("image_url di luar bucket kegiatan ditolak", async () => {
  const body = input("external-image");
  delete body.image;
  body.image_url = "https://example.com/outside.png";
  const response = await api("/api/v1/kegiatan", {
    method: "POST",
    token: users.admin!.token,
    body,
  });
  await expectFriendlyError(response, "bucket kegiatan");
});

test("anon tidak bisa menulis tabel langsung lewat PostgREST", async () => {
  const title = `${namespace}-direct-anon`;
  const response = await fetch(`${env.apiUrl}/rest/v1/trainer_activities`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${env.anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      year: 2026,
      program: "sobat",
      kind: "poster",
      title,
      drive_url: "https://drive.google.com/file/d/anon/view",
      image_url: `${env.apiUrl}/storage/v1/object/public/${bucketName}/untrusted.png`,
      created_by: users.admin!.userId,
    }),
  });
  expect(response.ok).toBe(false);
  const { data, error } = await createAdmin(env)
    .from("trainer_activities")
    .select("id")
    .eq("title", title);
  expect(error).toBeNull();
  expect(data).toHaveLength(0);

  const owner = users.admin!;
  const forgedCreatorTitle = `${namespace}-direct-forged-creator`;
  const forgedCreator = await fetch(
    `${env.apiUrl}/rest/v1/trainer_activities`,
    {
      method: "POST",
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${owner.token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        year: 2026,
        program: "sobat",
        kind: "poster",
        title: forgedCreatorTitle,
        drive_url: "https://drive.google.com/file/d/forged-creator/view",
        image_url: `${env.apiUrl}/storage/v1/object/public/${bucketName}/direct.png`,
        created_by: users.leader!.userId,
      }),
    },
  );
  expect(forgedCreator.ok).toBe(false);

  const validTitle = `${namespace}-direct-valid-creator`;
  const validInsert = await fetch(`${env.apiUrl}/rest/v1/trainer_activities`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${owner.token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      year: 2026,
      program: "sobat",
      kind: "poster",
      title: validTitle,
      drive_url: "https://drive.google.com/file/d/valid-owner/view",
      image_url: `${env.apiUrl}/storage/v1/object/public/${bucketName}/direct.png`,
      created_by: owner.userId,
    }),
  });
  expect(validInsert.ok).toBe(true);
  const [inserted] = (await validInsert.json()) as Array<{ id: string }>;
  expect(inserted?.id).toBeTruthy();

  const forgedUpdater = await fetch(
    `${env.apiUrl}/rest/v1/trainer_activities?id=eq.${encodeURIComponent(inserted.id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${owner.token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        title: `${namespace}-direct-forged-updater`,
        updated_by: users.leader!.userId,
      }),
    },
  );
  expect(forgedUpdater.ok).toBe(false);
  const { data: unchanged, error: unchangedError } = await createAdmin(env)
    .from("trainer_activities")
    .select("title, created_by, updated_by")
    .eq("id", inserted.id)
    .single();
  expect(unchangedError).toBeNull();
  expect(unchanged).toMatchObject({
    title: validTitle,
    created_by: owner.userId,
    updated_by: null,
  });
});
