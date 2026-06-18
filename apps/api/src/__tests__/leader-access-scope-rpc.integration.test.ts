import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  serviceRoleClient,
  authenticatedClient,
  createTestUser,
  type TestUser,
} from "./helpers/db-integration-client";

describe("Leader Scope Snapshot RPC Integration", () => {
  let sbAdmin: SupabaseClient;
  let leaderUser: TestUser;
  let trainerUser: TestUser;
  let leaderClient: SupabaseClient;
  let trainerClient: SupabaseClient;
  let pesertaId: string;
  let groupId: string;
  let requestId: string;

  beforeAll(async () => {
    sbAdmin = serviceRoleClient();
    leaderUser = await createTestUser("leader");
    trainerUser = await createTestUser("trainer");
    leaderClient = await authenticatedClient(leaderUser.email, leaderUser.password);
    trainerClient = await authenticatedClient(trainerUser.email, trainerUser.password);

    const { data: peserta } = await sbAdmin
      .from("profiler_peserta")
      .insert({
        nama: "Leader Scope Agent",
        batch_name: "Batch RPC Scope",
        tim: "Tim RPC Scope",
      })
      .select("id")
      .single();
    pesertaId = peserta!.id;

    const { data: group } = await sbAdmin
      .from("access_groups")
      .insert({
        name: "Scope Group RPC",
        description: "integration test",
      })
      .select("id")
      .single();
    groupId = group!.id;

    await sbAdmin.from("access_group_items").insert([
      { access_group_id: groupId, field_name: "peserta_id", field_value: pesertaId },
      { access_group_id: groupId, field_name: "batch_name", field_value: "Batch RPC Scope" },
      { access_group_id: groupId, field_name: "tim", field_value: "Tim RPC Scope" },
      { access_group_id: groupId, field_name: "service_type", field_value: "call" },
    ]);

    const { data: request } = await sbAdmin
      .from("leader_access_requests")
      .insert({
        leader_user_id: leaderUser.id,
        module: "sidak",
        status: "approved",
        reviewed_by: trainerUser.id,
      })
      .select("id")
      .single();
    requestId = request!.id;

    await sbAdmin.from("leader_access_request_groups").insert({
      request_id: requestId,
      access_group_id: groupId,
    });
  });

  afterAll(async () => {
    await sbAdmin.from("leader_access_request_groups").delete().eq("request_id", requestId);
    await sbAdmin.from("leader_access_requests").delete().eq("id", requestId);
    await sbAdmin.from("access_group_items").delete().eq("access_group_id", groupId);
    await sbAdmin.from("access_groups").delete().eq("id", groupId);
    await sbAdmin.from("profiler_peserta").delete().eq("id", pesertaId);
    await sbAdmin.from("profiles").delete().in("id", [leaderUser.id, trainerUser.id]);
  });

  it("service_role can execute get_leader_scope_snapshot and receives the expected shape", async () => {
    const { data, error } = await sbAdmin.rpc("get_leader_scope_snapshot", {
      p_leader_user_id: leaderUser.id,
      p_module: "sidak",
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data![0].request_ids).toContain(requestId);
    expect(data![0].peserta_ids).toContain(pesertaId);
    expect(data![0].batch_names).toContain("Batch RPC Scope");
    expect(data![0].tims).toContain("Tim RPC Scope");
    expect(data![0].service_types).toContain("call");
  });

  it("authenticated non-service clients do not gain direct execute access", async () => {
    const { error } = await leaderClient.rpc("get_leader_scope_snapshot", {
      p_leader_user_id: leaderUser.id,
      p_module: "sidak",
    });

    expect(error).not.toBeNull();
  });
});
