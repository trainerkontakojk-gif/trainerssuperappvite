// ═══════════════════════════════════════════════════════════════
// PDKT Mailbox RPC Integration Tests (Local Supabase)
//
// IMPORTANT: These tests run against a real local Supabase instance.
// Run `bash scripts/integration/supabase-bootstrap.sh` first.
//
// Tier: test:db-integration (separate from unit/core/fast)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  serviceRoleClient,
  authenticatedClient,
  anonClient,
  createTestUser,
  deleteAuthUser,
  getEnv,
  type TestUser,
} from "./helpers/db-integration-client";
import {
  FIXTURE_SENDER_NAME,
  FIXTURE_SENDER_EMAIL,
  FIXTURE_SUBJECT,
  FIXTURE_SNIPPET,
  FIXTURE_SCENARIO_SNAPSHOT,
  FIXTURE_CONFIG_SNAPSHOT,
  FIXTURE_INBOUND_EMAIL,
  FIXTURE_AGENT_REPLY,
  FIXTURE_TIME_TAKEN_SECONDS,
  cleanupTestMailboxData,
} from "./fixtures/pdkt-mailbox-fixtures";

// ── Test Suite ───────────────────────────────────────────────

describe("PDKT Mailbox RPC Integration", () => {
  let sbAdmin: SupabaseClient;
  let sbAnon: SupabaseClient;
  let agentUser: TestUser;
  let trainerUser: TestUser;
  let leaderUser: TestUser;
  let agentClient: SupabaseClient;
  let trainerClient: SupabaseClient;
  let leaderClient: SupabaseClient;

  beforeAll(async () => {
    sbAdmin = serviceRoleClient();
    sbAnon = anonClient();

    // Create test users via Auth Admin API
    agentUser = await createTestUser("agent");
    trainerUser = await createTestUser("trainer");
    leaderUser = await createTestUser("leader");

    // Create authenticated clients
    agentClient = await authenticatedClient(
      agentUser.email,
      agentUser.password,
    );
    trainerClient = await authenticatedClient(
      trainerUser.email,
      trainerUser.password,
    );
    leaderClient = await authenticatedClient(
      leaderUser.email,
      leaderUser.password,
    );
  });

  afterAll(async () => {
    await cleanupTestMailboxData(sbAdmin, [agentUser.id, trainerUser.id, leaderUser.id]);

    // Cleanup test users (cascade deletes profiles)
    for (const user of [agentUser, trainerUser, leaderUser]) {
      // Delete profile first, then auth user
      await sbAdmin.from("profiles").delete().eq("id", user.id);
      await fetch(
        `http://127.0.0.1:54321/auth/v1/admin/users/${user.id}`,
        {
          method: "DELETE",
          headers: {
            apikey:
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
            Authorization:
              "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
          },
        },
      );
    }
  });

  // ═══════════════════════════════════════════════════════════
  // RPC Signature & Grant Assertions
  // ═══════════════════════════════════════════════════════════

  describe("RPC signature and grant assertions", () => {
    it("submit_pdkt_mailbox_batch returns UUID", async () => {
      // Must use authenticated client since RPC checks auth.uid()
      const { data, error } = await trainerClient.rpc(
        "submit_pdkt_mailbox_batch",
        {
          p_client_request_id: "sig-batch-" + Date.now(),
          p_sender_name: FIXTURE_SENDER_NAME,
          p_sender_email: FIXTURE_SENDER_EMAIL,
          p_subject: "[SIG-TEST] Batch insert",
          p_snippet: "Signature test",
          p_scenario_snapshot: FIXTURE_SCENARIO_SNAPSHOT,
          p_config_snapshot: FIXTURE_CONFIG_SNAPSHOT,
          p_inbound_email: FIXTURE_INBOUND_EMAIL,
        },
      );
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(typeof data).toBe("string");
      expect(data).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", data);
    });

    it("submit_pdkt_mailbox_reply returns UUID (history_id)", async () => {
      const { data: mailboxId } = await agentClient.rpc(
        "submit_pdkt_mailbox_batch",
        {
          p_client_request_id: "sig-reply-" + Date.now(),
          p_sender_name: FIXTURE_SENDER_NAME,
          p_sender_email: FIXTURE_SENDER_EMAIL,
          p_subject: "[SIG-TEST] Reply sig",
          p_snippet: "Signature test reply",
          p_scenario_snapshot: FIXTURE_SCENARIO_SNAPSHOT,
          p_config_snapshot: FIXTURE_CONFIG_SNAPSHOT,
          p_inbound_email: FIXTURE_INBOUND_EMAIL,
        },
      );
      expect(mailboxId).toBeDefined();

      const { data: historyId, error: replyErr } = await agentClient.rpc(
        "submit_pdkt_mailbox_reply",
        {
          p_mailbox_id: mailboxId,
          p_agent_reply: FIXTURE_AGENT_REPLY,
          p_time_taken: FIXTURE_TIME_TAKEN_SECONDS,
        },
      );
      expect(replyErr).toBeNull();
      expect(historyId).toBeDefined();
      expect(typeof historyId).toBe("string");
      expect(historyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
      await sbAdmin.from("pdkt_history").delete().eq("id", historyId);
    });

    it("soft_delete_pdkt_mailbox_item returns void (no error)", async () => {
      // Create item as authenticated agent, delete as trainer
      const { data: mailboxId } = await agentClient.rpc(
        "submit_pdkt_mailbox_batch",
        {
          p_client_request_id: "sig-del-" + Date.now(),
          p_sender_name: "Del Test",
          p_sender_email: "del@test.com",
          p_subject: "[SIG-TEST] Delete sig",
          p_snippet: "Signature test delete",
          p_scenario_snapshot: FIXTURE_SCENARIO_SNAPSHOT,
          p_config_snapshot: FIXTURE_CONFIG_SNAPSHOT,
          p_inbound_email: FIXTURE_INBOUND_EMAIL,
        },
      );
      expect(mailboxId).toBeDefined();

      // Soft delete via trainer client (trainer has admin-like privileges)
      const { error: deleteErr } = await trainerClient.rpc(
        "soft_delete_pdkt_mailbox_item",
        { p_mailbox_id: mailboxId },
      );
      expect(deleteErr).toBeNull();

      // Verify via service_role
      const { data: item } = await sbAdmin
        .from("pdkt_mailbox_items")
        .select("status, deleted_at")
        .eq("id", mailboxId)
        .single();
      expect(item).toBeDefined();
      expect(item!.status).toBe("deleted");
      expect(item!.deleted_at).not.toBeNull();

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
    });

    it("grants exist: authenticated role can execute all three RPCs", async () => {
      const { data: mailboxId, error: batchErr } = await trainerClient.rpc(
        "submit_pdkt_mailbox_batch",
        {
          p_client_request_id: "grant-test-" + Date.now(),
          p_sender_name: "Grant Test",
          p_sender_email: "grant@test.com",
          p_subject: "[GRANT] Test",
          p_snippet: "Grant test",
          p_scenario_snapshot: FIXTURE_SCENARIO_SNAPSHOT,
          p_config_snapshot: FIXTURE_CONFIG_SNAPSHOT,
          p_inbound_email: FIXTURE_INBOUND_EMAIL,
        },
      );
      expect(batchErr).toBeNull();
      expect(mailboxId).toBeDefined();

      const { data: historyId, error: replyErr } = await trainerClient.rpc(
        "submit_pdkt_mailbox_reply",
        {
          p_mailbox_id: mailboxId,
          p_agent_reply: FIXTURE_AGENT_REPLY,
          p_time_taken: 30,
        },
      );
      expect(replyErr).toBeNull();
      expect(historyId).toBeDefined();

      const { error: deleteErr } = await trainerClient.rpc(
        "soft_delete_pdkt_mailbox_item",
        { p_mailbox_id: mailboxId },
      );
      expect(deleteErr).toBeNull();

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
      await sbAdmin.from("pdkt_history").delete().eq("id", historyId);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // submit_pdkt_mailbox_batch
  // ═══════════════════════════════════════════════════════════

  describe("submit_pdkt_mailbox_batch", () => {
    it("inserts a new mailbox item with all fields", async () => {
      const { data: mailboxId, error } = await agentClient.rpc(
        "submit_pdkt_mailbox_batch",
        {
          p_client_request_id: null,
          p_sender_name: FIXTURE_SENDER_NAME,
          p_sender_email: FIXTURE_SENDER_EMAIL,
          p_subject: FIXTURE_SUBJECT,
          p_snippet: FIXTURE_SNIPPET,
          p_scenario_snapshot: FIXTURE_SCENARIO_SNAPSHOT,
          p_config_snapshot: FIXTURE_CONFIG_SNAPSHOT,
          p_inbound_email: FIXTURE_INBOUND_EMAIL,
        },
      );
      expect(error).toBeNull();
      expect(mailboxId).toBeDefined();

      const { data: item } = await sbAdmin
        .from("pdkt_mailbox_items")
        .select("*")
        .eq("id", mailboxId)
        .single();
      expect(item).toBeDefined();
      expect(item!.sender_name).toBe(FIXTURE_SENDER_NAME);
      expect(item!.sender_email).toBe(FIXTURE_SENDER_EMAIL);
      expect(item!.subject).toBe(FIXTURE_SUBJECT);
      expect(item!.snippet).toBe(FIXTURE_SNIPPET);
      expect(item!.status).toBe("open");
      expect(item!.created_by_user_id).toBe(agentUser.id);
      expect(item!.emails_thread).toEqual([FIXTURE_INBOUND_EMAIL]);

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
    });

    it("rejects unauthenticated (anon) callers", async () => {
      const { data, error } = await sbAnon.rpc("submit_pdkt_mailbox_batch", {
        p_client_request_id: null,
        p_sender_name: "Anon Test",
        p_sender_email: "anon@test.com",
        p_subject: "Anon test",
        p_snippet: "Anon test",
        p_scenario_snapshot: FIXTURE_SCENARIO_SNAPSHOT,
        p_config_snapshot: FIXTURE_CONFIG_SNAPSHOT,
        p_inbound_email: FIXTURE_INBOUND_EMAIL,
      });
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it("is idempotent: same client_request_id + creator returns existing item", async () => {
      const reqId = "idempotent-batch-" + Date.now();

      const { data: id1, error: err1 } = await agentClient.rpc(
        "submit_pdkt_mailbox_batch",
        {
          p_client_request_id: reqId,
          p_sender_name: FIXTURE_SENDER_NAME,
          p_sender_email: FIXTURE_SENDER_EMAIL,
          p_subject: "[IDEM] Test",
          p_snippet: "Idempotent test",
          p_scenario_snapshot: FIXTURE_SCENARIO_SNAPSHOT,
          p_config_snapshot: FIXTURE_CONFIG_SNAPSHOT,
          p_inbound_email: FIXTURE_INBOUND_EMAIL,
        },
      );
      expect(err1).toBeNull();
      expect(id1).toBeDefined();

      const { data: id2, error: err2 } = await agentClient.rpc(
        "submit_pdkt_mailbox_batch",
        {
          p_client_request_id: reqId,
          p_sender_name: FIXTURE_SENDER_NAME,
          p_sender_email: FIXTURE_SENDER_EMAIL,
          p_subject: "[IDEM] Test",
          p_snippet: "Idempotent test",
          p_scenario_snapshot: FIXTURE_SCENARIO_SNAPSHOT,
          p_config_snapshot: FIXTURE_CONFIG_SNAPSHOT,
          p_inbound_email: FIXTURE_INBOUND_EMAIL,
        },
      );
      expect(err2).toBeNull();
      expect(id2).toBe(id1);

      const { data: items } = await sbAdmin
        .from("pdkt_mailbox_items")
        .select("id", { count: "exact" })
        .eq("client_request_id", reqId);
      expect(items).toHaveLength(1);

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", id1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // submit_pdkt_mailbox_reply
  // ═══════════════════════════════════════════════════════════

  describe("submit_pdkt_mailbox_reply", () => {
    async function createMailbox(
      client: SupabaseClient,
      reqIdSuffix?: string,
    ) {
      const { data: id, error } = await client.rpc(
        "submit_pdkt_mailbox_batch",
        {
          p_client_request_id:
            "reply-fixture-" + (reqIdSuffix || Date.now()),
          p_sender_name: FIXTURE_SENDER_NAME,
          p_sender_email: FIXTURE_SENDER_EMAIL,
          p_subject: "[REPLY] Fixture",
          p_snippet: "Reply test fixture",
          p_scenario_snapshot: FIXTURE_SCENARIO_SNAPSHOT,
          p_config_snapshot: FIXTURE_CONFIG_SNAPSHOT,
          p_inbound_email: FIXTURE_INBOUND_EMAIL,
        },
      );
      if (error) throw error;
      return id as string;
    }

    it("inserts history + updates mailbox atomically", async () => {
      const mailboxId = await createMailbox(agentClient);

      const { data: historyId, error } = await agentClient.rpc(
        "submit_pdkt_mailbox_reply",
        {
          p_mailbox_id: mailboxId,
          p_agent_reply: FIXTURE_AGENT_REPLY,
          p_time_taken: FIXTURE_TIME_TAKEN_SECONDS,
        },
      );
      expect(error).toBeNull();
      expect(historyId).toBeDefined();

      const { data: history } = await sbAdmin
        .from("pdkt_history")
        .select("*")
        .eq("id", historyId)
        .single();
      expect(history).toBeDefined();
      expect(history!.time_taken).toBe(FIXTURE_TIME_TAKEN_SECONDS);
      expect(history!.evaluation_status).toBe("processing");
      expect(history!.user_id).toBe(agentUser.id);
      expect(history!.emails).toEqual([
        FIXTURE_INBOUND_EMAIL,
        FIXTURE_AGENT_REPLY,
      ]);

      const { data: item } = await sbAdmin
        .from("pdkt_mailbox_items")
        .select("status, history_id, replied_at, emails_thread")
        .eq("id", mailboxId)
        .single();
      expect(item).toBeDefined();
      expect(item!.status).toBe("replied");
      expect(item!.history_id).toBe(historyId);
      expect(item!.replied_at).not.toBeNull();
      expect(item!.emails_thread).toEqual([
        FIXTURE_INBOUND_EMAIL,
        FIXTURE_AGENT_REPLY,
      ]);

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
      await sbAdmin.from("pdkt_history").delete().eq("id", historyId);
    });

    it("rejects reply to already-replied mailbox (idempotent)", async () => {
      const mailboxId = await createMailbox(agentClient);

      const { data: h1 } = await agentClient.rpc("submit_pdkt_mailbox_reply", {
        p_mailbox_id: mailboxId,
        p_agent_reply: FIXTURE_AGENT_REPLY,
        p_time_taken: 30,
      });

      const { data: h2, error: err2 } = await agentClient.rpc(
        "submit_pdkt_mailbox_reply",
        {
          p_mailbox_id: mailboxId,
          p_agent_reply: FIXTURE_AGENT_REPLY,
          p_time_taken: 60,
        },
      );
      expect(err2).toBeNull();
      expect(h2).toBe(h1);

      const { data: hRows } = await sbAdmin
        .from("pdkt_history")
        .select("id", { count: "exact" })
        .eq("id", h1);
      expect(hRows).toHaveLength(1);

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
      await sbAdmin.from("pdkt_history").delete().eq("id", h1);
    });

    it("rejects reply to deleted mailbox", async () => {
      const mailboxId = await createMailbox(agentClient);

      // Soft delete via admin directly (RPC requires auth)
      await sbAdmin
        .from("pdkt_mailbox_items")
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", mailboxId);

      const { data, error } = await agentClient.rpc(
        "submit_pdkt_mailbox_reply",
        {
          p_mailbox_id: mailboxId,
          p_agent_reply: FIXTURE_AGENT_REPLY,
          p_time_taken: 30,
        },
      );
      expect(error).not.toBeNull();
      expect(data).toBeNull();

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
    });

    it("rejects unauthenticated (anon) callers", async () => {
      const mailboxId = await createMailbox(agentClient);

      const { data, error } = await sbAnon.rpc("submit_pdkt_mailbox_reply", {
        p_mailbox_id: mailboxId,
        p_agent_reply: FIXTURE_AGENT_REPLY,
        p_time_taken: 30,
      });
      expect(error).not.toBeNull();
      expect(data).toBeNull();

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
    });

    it("rejects non-existent mailbox", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const { data, error } = await agentClient.rpc(
        "submit_pdkt_mailbox_reply",
        {
          p_mailbox_id: fakeId,
          p_agent_reply: FIXTURE_AGENT_REPLY,
          p_time_taken: 30,
        },
      );
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // soft_delete_pdkt_mailbox_item
  // ═══════════════════════════════════════════════════════════

  describe("soft_delete_pdkt_mailbox_item", () => {
    async function createMailbox(
      client: SupabaseClient,
      reqIdSuffix?: string,
    ) {
      const { data: id, error } = await client.rpc(
        "submit_pdkt_mailbox_batch",
        {
          p_client_request_id:
            "delete-fixture-" + (reqIdSuffix || Date.now()),
          p_sender_name: FIXTURE_SENDER_NAME,
          p_sender_email: FIXTURE_SENDER_EMAIL,
          p_subject: "[DELETE] Fixture",
          p_snippet: "Delete test fixture",
          p_scenario_snapshot: FIXTURE_SCENARIO_SNAPSHOT,
          p_config_snapshot: FIXTURE_CONFIG_SNAPSHOT,
          p_inbound_email: FIXTURE_INBOUND_EMAIL,
        },
      );
      if (error) throw error;
      return id as string;
    }

    it("owner (agent) can soft-delete own item", async () => {
      const mailboxId = await createMailbox(agentClient);

      const { error } = await agentClient.rpc(
        "soft_delete_pdkt_mailbox_item",
        { p_mailbox_id: mailboxId },
      );
      expect(error).toBeNull();

      const { data: item } = await sbAdmin
        .from("pdkt_mailbox_items")
        .select("status, deleted_at, updated_at")
        .eq("id", mailboxId)
        .single();
      expect(item).toBeDefined();
      expect(item!.status).toBe("deleted");
      expect(item!.deleted_at).not.toBeNull();

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
    });

    it("trainer can soft-delete anyone's item", async () => {
      const mailboxId = await createMailbox(agentClient);

      const { error } = await trainerClient.rpc(
        "soft_delete_pdkt_mailbox_item",
        { p_mailbox_id: mailboxId },
      );
      expect(error).toBeNull();

      const { data: item } = await sbAdmin
        .from("pdkt_mailbox_items")
        .select("status")
        .eq("id", mailboxId)
        .single();
      expect(item).toBeDefined();
      expect(item!.status).toBe("deleted");

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
    });

    it("leader cannot delete another user's item", async () => {
      const mailboxId = await createMailbox(agentClient);

      const { error } = await leaderClient.rpc(
        "soft_delete_pdkt_mailbox_item",
        { p_mailbox_id: mailboxId },
      );
      expect(error).not.toBeNull();

      const { data: item } = await sbAdmin
        .from("pdkt_mailbox_items")
        .select("status")
        .eq("id", mailboxId)
        .single();
      expect(item).toBeDefined();
      expect(item!.status).not.toBe("deleted");

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
    });

    it("rejects non-existent mailbox", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const { error } = await agentClient.rpc("soft_delete_pdkt_mailbox_item", {
        p_mailbox_id: fakeId,
      });
      expect(error).not.toBeNull();
    });

    it("rejects unauthenticated (anon) callers", async () => {
      const mailboxId = await createMailbox(agentClient);

      const { error } = await sbAnon.rpc("soft_delete_pdkt_mailbox_item", {
        p_mailbox_id: mailboxId,
      });
      expect(error).not.toBeNull();

      await sbAdmin.from("pdkt_mailbox_items").delete().eq("id", mailboxId);
    });
  });
});
