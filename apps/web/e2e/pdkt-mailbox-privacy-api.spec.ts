import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Hono } from "hono";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";

/**
 * Privasi skenario mailbox PDKT — backend NYATA in-process + Supabase lokal.
 *
 * Kontrak (`plans/markdown/pdkt-mailbox-scenario-privacy.md`): peserta simulasi
 * tidak boleh melihat karakter konsumen, isi skenario, kunci jawaban, atau
 * penerima email, baik lewat API detail maupun lewat PostgREST langsung dengan
 * JWT-nya sendiri. Mailbox bersama, balasan, dan hapus tetap berjalan.
 */

test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);

// Penanda unik: bila salah satu muncul di payload, data skenario bocor.
const SECRET = {
  consumerTypeName: `Karakter Rahasia ${ns}`,
  consumerTypeId: `karakter-${ns}`,
  difficulty: "Hard",
  scenarioTitle: `Skenario Rahasia ${ns}`,
  scenarioDescription: `Deskripsi skenario rahasia ${ns}`,
  expectedAnswer: `Kunci jawaban rahasia ${ns}`,
  recipientAddress: `pengaduan-${ns}@perusahaan-terlapor.test`,
};

const SCENARIO = {
  id: `scn-${ns}`,
  category: "Pinjaman",
  title: SECRET.scenarioTitle,
  description: SECRET.scenarioDescription,
  isActive: true,
  expectedAnswer: SECRET.expectedAnswer,
  primaryRecipientType: "reported_company",
  recipientTargets: { mode: "single", emails: [SECRET.recipientAddress] },
};

const CONFIG = {
  scenarios: [SCENARIO],
  consumerType: {
    id: SECRET.consumerTypeId,
    name: SECRET.consumerTypeName,
    description: "Sangat marah dan tidak sabar.",
    difficulty: SECRET.difficulty,
    tone: "Marah",
  },
  identity: {
    name: "Budi Santoso",
    email: `budi-${ns}@mail.test`,
    city: "Bandung",
    bodyName: "Budi",
  },
  enableImageGeneration: false,
  selectedModel: "gemini-3.8-flash",
  resolvedConsumerNameMentionPattern: "none",
  writingStyleMode: "training",
  recipientContext: {
    primaryRecipientType: "reported_company",
    primaryRecipientAddress: SECRET.recipientAddress,
    ccRecipients: ["konsumen@ojk.go.id"],
    replyIntent: "reply_to_company_with_ojk_cc",
  },
};

const INBOUND = {
  id: `msg-${ns}`,
  from: CONFIG.identity.email,
  to: SECRET.recipientAddress,
  subject: `Dana sudah lunas tapi masih ditagih ${ns}`,
  body: "Saya sudah melunasi pinjaman tetapi masih terus ditagih.",
  timestamp: new Date().toISOString(),
  isAgent: false,
  recipientContext: CONFIG.recipientContext,
};

const SNAPSHOT_COLUMNS = [
  "scenario_snapshot",
  "config_snapshot",
  "inbound_email",
  "emails_thread",
] as const;

type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
let trainer: Identity;
let agent: Identity;
const mailboxIds: string[] = [];
const historyIds: string[] = [];

function userClient(token: string): SupabaseClient {
  return createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function api(path: string, token: string, method = "GET") {
  return tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function insertMailbox(): Promise<string> {
  const { data, error } = await createAdmin(env)
    .from("pdkt_mailbox_items")
    .insert({
      user_id: trainer.userId,
      created_by_user_id: trainer.userId,
      client_request_id: `e2e-privacy-${randomUUID()}`,
      status: "open",
      is_shared_copy: false,
      sender_name: CONFIG.identity.name,
      sender_email: CONFIG.identity.email,
      subject: INBOUND.subject,
      snippet: INBOUND.body,
      scenario_snapshot: SCENARIO,
      config_snapshot: CONFIG,
      inbound_email: INBOUND,
      emails_thread: [INBOUND],
    })
    .select("id")
    .single();
  if (error) throw error;
  mailboxIds.push(data.id);
  return data.id;
}

function expectNoSecrets(payload: unknown) {
  const text = JSON.stringify(payload);
  for (const [label, value] of Object.entries(SECRET)) {
    if (label === "difficulty") continue; // terlalu umum; dicek lewat consumerType.
    expect(text, `payload membocorkan ${label}`).not.toContain(value);
  }
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

  trainer = await createUserWithJwt(env, "trainer", `pdkt-privacy-${ns}`);
  agent = await createUserWithJwt(env, "agent", `pdkt-privacy-${ns}`);
  await insertMailbox();

  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  const admin = createAdmin(env);
  if (historyIds.length)
    await admin.from("pdkt_history").delete().in("id", historyIds);
  if (mailboxIds.length)
    await admin.from("pdkt_mailbox_items").delete().in("id", mailboxIds);
  for (const user of [trainer, agent].filter(Boolean)) {
    const { error } = await admin.auth.admin.deleteUser(user.userId);
    if (error) console.warn("cleanup user gagal:", error.message);
  }
});

test("agent tidak bisa membaca snapshot skenario langsung dari tabel", async () => {
  const client = userClient(agent.token);
  const [mailboxId] = mailboxIds;

  for (const column of SNAPSHOT_COLUMNS) {
    const { data, error } = await client
      .from("pdkt_mailbox_items")
      .select(column)
      .eq("id", mailboxId!);
    expect(
      error?.code,
      `${column} harus ditolak, data=${JSON.stringify(data)}`,
    ).toBe("42501");
  }

  const star = await client
    .from("pdkt_mailbox_items")
    .select("*")
    .eq("id", mailboxId!);
  expect(star.error?.code, "select=* tidak boleh membuka kolom snapshot").toBe(
    "42501",
  );

  // Filter pada kolom tersembunyi juga ditolak, jadi isinya tidak bisa ditebak.
  const probe = await client
    .from("pdkt_mailbox_items")
    .select("id")
    .eq("config_snapshot->consumerType->>id", SECRET.consumerTypeId);
  expect(probe.error?.code).toBe("42501");

  // Kolom scalar tetap terbaca: mailbox bersama tetap berfungsi.
  const scalar = await client
    .from("pdkt_mailbox_items")
    .select("id, subject, status")
    .eq("id", mailboxId!);
  expect(scalar.error).toBeNull();
  expect(scalar.data).toEqual([
    { id: mailboxId, subject: INBOUND.subject, status: "open" },
  ]);
});

test("detail mailbox API tidak membocorkan karakter, skenario, atau penerima", async () => {
  const [mailboxId] = mailboxIds;

  for (const identity of [agent, trainer]) {
    const response = await api(`/pdkt/mailbox/${mailboxId}`, identity.token);
    expect(response.status).toBe(200);
    const body = await response.json();
    const item = body.data as Record<string, any>;

    expect(item.subject).toBe(INBOUND.subject);
    expect(item.inbound_email.body).toBe(INBOUND.body);
    expect(item.inbound_email.from).toBe(INBOUND.from);
    expect(item.inbound_email.to).toBe("");
    expect(item.inbound_email).not.toHaveProperty("recipientContext");
    expect(item).not.toHaveProperty("scenario_snapshot");
    expect(item).not.toHaveProperty("config_snapshot");
    for (const email of item.emails_thread as Array<Record<string, unknown>>) {
      expect(email).not.toHaveProperty("recipientContext");
      if (!email.isAgent) expect(email.to).toBe("");
    }
    expectNoSecrets(item);
  }
});

test("mailbox bersama, balasan, dan hapus tetap berjalan", async () => {
  const [mailboxId] = mailboxIds;

  const list = await api("/pdkt/mailbox", agent.token);
  expect(list.status).toBe(200);
  const listBody = await list.json();
  const listed = (listBody.data as Array<Record<string, unknown>>).find(
    (row) => row.id === mailboxId,
  );
  expect(listed?.subject).toBe(INBOUND.subject);
  expectNoSecrets(listed);

  // RPC balasan SECURITY DEFINER tetap membaca snapshot dan membuat history.
  const reply = await userClient(agent.token).rpc(
    "submit_pdkt_mailbox_reply_with_outcome",
    {
      p_mailbox_id: mailboxId,
      p_agent_reply: {
        id: `reply-${ns}`,
        from: agent.email,
        to: INBOUND.from,
        subject: `Re: ${INBOUND.subject}`,
        body: "Mohon maaf, kami periksa status pinjaman Bapak.",
        timestamp: new Date().toISOString(),
        isAgent: true,
      },
      p_time_taken: 30,
    },
  );
  expect(reply.error).toBeNull();
  const historyId = (reply.data as { history_id: string }).history_id;
  expect(historyId).toBeTruthy();
  historyIds.push(historyId);

  // Pembuat tetap bisa menghapus item buatannya.
  const second = await insertMailbox();
  const deleted = await api(`/pdkt/mailbox/${second}`, trainer.token, "DELETE");
  expect(deleted.status).toBe(200);
  const gone = await api(`/pdkt/mailbox/${second}`, trainer.token);
  expect(gone.status).toBe(404);
});
