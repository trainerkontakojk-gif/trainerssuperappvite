// ─────────────────────────────────────────────────────────────
// PDKT Mailbox Integration Test Fixtures
// Deterministic data for RPC tests
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Fixture data ─────────────────────────────────────────────

export const FIXTURE_SENDER_NAME = "John Doe";
export const FIXTURE_SENDER_EMAIL = "john.doe@example.com";
export const FIXTURE_SUBJECT = "Test Subject — Respon Pertanyaan";
export const FIXTURE_SNIPPET = "Saya ingin bertanya tentang produk KTA...";

export const FIXTURE_SCENARIO_SNAPSHOT = {
  id: "scenario-fixture-001",
  name: "Test Scenario — KTA",
  script: "Test script content",
  attachments: [],
};

export const FIXTURE_CONFIG_SNAPSHOT = {
  writingStyle: "formal",
  consumerNameMention: "middle",
  maxReplies: 3,
};

export const FIXTURE_INBOUND_EMAIL = {
  type: "inbound",
  from: { name: "John Doe", email: "john.doe@example.com" },
  to: "customer-service@bankmuamalat.co.id",
  subject: "Test Subject — Respon Pertanyaan",
  body: "Saya ingin bertanya tentang produk KTA. Apakah ada promo terbaru?",
  attachments: [],
  timestamp: "2026-01-15T08:00:00.000Z",
};

export const FIXTURE_AGENT_REPLY = {
  type: "agent_reply",
  from: {
    name: "Test Agent",
    email: "agent@bankmuamalat.co.id",
  },
  to: "john.doe@example.com",
  subject: "RE: Test Subject — Respon Pertanyaan",
  body:
    "Terima kasih atas pertanyaannya, John. Kami memiliki promo KTA dengan bunga 0% untuk 6 bulan pertama.",
  attachments: [],
  timestamp: "2026-01-15T08:02:00.000Z",
};

export const FIXTURE_TIME_TAKEN_SECONDS = 120;

/** Cleanup only rows owned by users created by this integration suite. */
export async function cleanupTestMailboxData(
  sb: SupabaseClient,
  userIds: string[],
) {
  if (userIds.length === 0) return;

  const { error: histErr } = await sb
    .from("pdkt_history")
    .delete()
    .in("user_id", userIds);
  if (histErr) {
    console.warn("pdkt_history cleanup warning:", histErr.message);
  }

  const { error: mailboxErr } = await sb
    .from("pdkt_mailbox_items")
    .delete()
    .in("user_id", userIds);
  if (mailboxErr) {
    console.warn("pdkt_mailbox_items cleanup warning:", mailboxErr.message);
  }
}
