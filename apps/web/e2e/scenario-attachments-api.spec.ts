import { createHash, randomUUID } from "node:crypto";
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
 * Lampiran skenario KETIK/PDKT disimpan di Storage, bukan sebagai base64 di
 * dalam JSON. Backend lokal sungguhan: Hono, PostgREST, dan Storage.
 */

test.describe.configure({ mode: "default" });
const env = readLoopbackEnv();
const ns = `scenario-files-${randomUUID().slice(0, 8)}`;
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const PNG = `data:image/png;base64,${PNG_BASE64}`;
const PDF_BASE64 = Buffer.from(
  `%PDF-1.4\n% ${ns}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`,
).toString("base64");
const PDF = `data:application/pdf;base64,${PDF_BASE64}`;
const OTHER_PNG = `data:image/png;base64,${Buffer.from(
  Buffer.concat([
    Buffer.from(PNG_BASE64, "base64"),
    Buffer.from(`-${ns}-other`),
  ]),
).toString("base64")}`;

function storageUrl(dataUrl: string, extension: string) {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `${env.apiUrl}/storage/v1/object/public/scenario-attachments/${digest}.${extension}`;
}

type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
let trainer: Identity;
let app: Hono;

async function api(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function expectServed(url: string, contentType: string) {
  const response = await fetch(url);
  expect(response.status, url).toBe(200);
  expect(response.headers.get("content-type")).toBe(contentType);
  expect(response.headers.get("cache-control")).toContain("max-age=31536000");
  return Buffer.from(await response.arrayBuffer());
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
  trainer = await createUserWithJwt(env, "trainer", ns);
  const unlimited = await createAdmin(env)
    .from("practice_limit_overrides")
    .insert({ user_id: trainer.userId, module: "pdkt", daily_limit: null });
  expect(unlimited.error).toBeNull();
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  const admin = createAdmin(env);
  if (!trainer) return;
  await admin.from("pdkt_mailbox_items").delete().eq("user_id", trainer.userId);
  await admin.from("pdkt_history").delete().eq("user_id", trainer.userId);
  await admin.auth.admin.deleteUser(trainer.userId);
});

test("KETIK settings keep scenario images in Storage, not in the settings JSON", async () => {
  const loaded = await api("/ketik/settings");
  expect(loaded.status).toBe(200);
  const original = (await loaded.json()).data;
  const external = "https://example.invalid/sudah-tautan.png";
  const settings = {
    ...original,
    scenarios: original.scenarios.map(
      (scenario: Record<string, unknown>, index: number) =>
        index === 0 ? { ...scenario, images: [PNG, external] } : scenario,
    ),
  };
  const saved = await api("/ketik/settings", "PUT", settings, {
    "x-settings-version": loaded.headers.get("x-settings-version")!,
  });
  expect(saved.status).toBe(200);

  const reloaded = await api("/ketik/settings");
  const images = (await reloaded.json()).data.scenarios[0].images;
  expect(images).toEqual([storageUrl(PNG, "png"), external]);
  const { data: row } = await createAdmin(env)
    .from("user_settings")
    .select("settings")
    .eq("user_id", trainer.userId)
    .single();
  expect(JSON.stringify(row!.settings)).not.toContain("base64,");
  expect(await expectServed(images[0], "image/png")).toEqual(
    Buffer.from(PNG_BASE64, "base64"),
  );

  // Saving the same picture again reuses the stored file.
  const again = await api("/ketik/settings", "PUT", settings, {
    "x-settings-version": reloaded.headers.get("x-settings-version")!,
  });
  expect(again.status).toBe(200);
});

test("PDKT settings keep image and PDF attachments in Storage", async () => {
  const loaded = await api("/pdkt/settings");
  expect(loaded.status).toBe(200);
  const scenario = {
    id: ns,
    category: "Pinjaman",
    title: `${ns} lampiran`,
    description: "Konsumen mengirim bukti tagihan.",
    isActive: true,
    attachmentImages: [PNG, PDF],
  };
  const saved = await api(
    "/pdkt/settings",
    "POST",
    { settings: { scenarios: [scenario] } },
    { "x-settings-version": loaded.headers.get("x-settings-version")! },
  );
  expect(saved.status).toBe(200);

  const reloaded = (await (await api("/pdkt/settings")).json()).data;
  const stored = reloaded.scenarios.find(
    (entry: { id: string }) => entry.id === ns,
  );
  expect(stored.attachmentImages).toEqual([
    storageUrl(PNG, "png"),
    storageUrl(PDF, "pdf"),
  ]);
  await expectServed(stored.attachmentImages[1], "application/pdf");
});

test("a new PDKT email stores its attachments as Storage links", async () => {
  const consumer = { id: "calm", name: "Tenang", description: "Tenang" };
  const recipient = `pengaduan-${ns}@company.test`;
  const response = await api("/pdkt/session/create", "POST", {
    client_request_id: randomUUID(),
    scenarioDraft: {
      id: `${ns}-mail`,
      category: "Pinjaman",
      title: `${ns} email`,
      description: "Konsumen mengirim bukti tagihan.",
      isActive: true,
      primaryRecipientType: "reported_company",
      recipientMode: "single",
      recipientEmails: [recipient],
      alwaysUseSampleEmail: true,
      sampleEmailTemplate: { subject: ns, body: "Bukti tagihan terlampir." },
      attachmentImages: [OTHER_PNG],
    },
    consumerTypeId: consumer.id,
    consumerTypeDraft: consumer,
    identity: {
      name: "Budi",
      bodyName: "Budi",
      city: "Bandung",
      email: `consumer-${ns}@mail.test`,
    },
    selectedModel: "gemini-3.8-flash",
    enableImageGeneration: false,
  });
  expect(response.status).toBe(200);
  const { id } = (await response.json()).data;

  const { data: row, error } = await createAdmin(env)
    .from("pdkt_mailbox_items")
    .select("inbound_email, emails_thread, scenario_snapshot, config_snapshot")
    .eq("id", id)
    .single();
  expect(error).toBeNull();
  expect(JSON.stringify(row)).not.toContain("base64,");
  expect(row!.inbound_email.attachments).toEqual([
    storageUrl(OTHER_PNG, "png"),
  ]);

  const detail = await api(`/pdkt/mailbox/${id}`);
  expect(detail.status).toBe(200);
  expect((await detail.json()).data.inbound_email.attachments).toEqual([
    storageUrl(OTHER_PNG, "png"),
  ]);
});

test("the backfill moves attachments already saved as base64 into Storage", async () => {
  const admin = createAdmin(env);
  const legacyPng = `data:image/png;base64,${Buffer.concat([
    Buffer.from(PNG_BASE64, "base64"),
    Buffer.from(`-${ns}-legacy`),
  ]).toString("base64")}`;
  const email = {
    id: `${ns}-legacy`,
    from: `consumer-${ns}@mail.test`,
    to: "pengaduan@company.test",
    subject: ns,
    body: "Bukti lama.",
    timestamp: new Date().toISOString(),
    isAgent: false,
    attachments: [legacyPng, PDF],
  };
  const config = {
    scenarios: [{ id: ns, title: ns, attachmentImages: [legacyPng, PDF] }],
  };
  const history = await admin
    .from("pdkt_history")
    .insert({
      user_id: trainer.userId,
      config,
      emails: [email],
      evaluation_status: "failed",
    })
    .select("id")
    .single();
  expect(history.error).toBeNull();
  const mailbox = await admin
    .from("pdkt_mailbox_items")
    .insert({
      user_id: trainer.userId,
      created_by_user_id: trainer.userId,
      client_request_id: randomUUID(),
      status: "open",
      is_shared_copy: false,
      sender_name: "Budi",
      sender_email: email.from,
      subject: ns,
      snippet: email.body,
      scenario_snapshot: config.scenarios[0],
      config_snapshot: config,
      inbound_email: email,
      emails_thread: [email],
    })
    .select("id")
    .single();
  expect(mailbox.error).toBeNull();

  const { backfillScenarioAttachments } =
    await import("../../api/src/lib/scenario-attachments");
  const first = await backfillScenarioAttachments({ pageSize: 2 });
  expect(first.rowsUpdated).toBeGreaterThanOrEqual(2);
  // Each distinct file was downloaded from the database at most once.
  expect(first.filesDownloaded).toBeLessThanOrEqual(first.filesUploaded);

  const pngUrl = storageUrl(legacyPng, "png");
  const pdfUrl = storageUrl(PDF, "pdf");
  const { data: historyRow } = await admin
    .from("pdkt_history")
    .select("config, emails")
    .eq("id", history.data!.id)
    .single();
  expect(historyRow!.emails[0].attachments).toEqual([pngUrl, pdfUrl]);
  expect(historyRow!.config.scenarios[0].attachmentImages).toEqual([
    pngUrl,
    pdfUrl,
  ]);
  const { data: mailboxRow } = await admin
    .from("pdkt_mailbox_items")
    .select("inbound_email, emails_thread, scenario_snapshot, config_snapshot")
    .eq("id", mailbox.data!.id)
    .single();
  expect(JSON.stringify(mailboxRow)).not.toContain("base64,");
  expect(mailboxRow!.emails_thread[0].attachments).toEqual([pngUrl, pdfUrl]);
  await expectServed(pngUrl, "image/png");

  const second = await backfillScenarioAttachments({ pageSize: 2 });
  expect(second).toMatchObject({ rowsUpdated: 0, filesDownloaded: 0 });
});
