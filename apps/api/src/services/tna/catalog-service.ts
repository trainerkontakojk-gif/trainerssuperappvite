import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createTnaProgramSchema,
  rootCauseClusterIds,
  tnaProgramSchema,
  updateTnaProgramSchema,
  type CreateTnaProgram,
  type TnaCatalogProgram,
  type TnaProgram,
  type TnaProgramCoverage,
  type UpdateTnaProgram,
} from "@trainers/types";
import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { logActivity } from "../activity-log-service";
import { throwTnaRpcError } from "./errors";
import { listTnaPrograms } from "./read-service";

// TNA phase 5 program catalog (plans/markdown/tna-phase-5.md D25, K32-K36).
// Reads use the caller JWT (RLS); writes go through the guarded service-role
// RPCs (K6), with the actor taken from authentication, never from the body.

interface CatalogWriteContext {
  supabase: SupabaseClient;
  actorId: string;
  actorName: string;
}

/** Every program, active or not, with how many plans (any status) use it. */
export async function listTnaCatalogPrograms(
  supabase: SupabaseClient,
): Promise<TnaCatalogProgram[]> {
  const [{ data, error }, plans] = await Promise.all([
    supabase.from("tna_programs").select("*").order("code"),
    fetchAllPages<{ id: string; program_id: string }>({
      build: ({ from, to }) =>
        supabase
          .from("tna_plans")
          .select("id, program_id")
          .order("id")
          .range(from, to) as never,
    }),
  ]);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const plan of plans)
    counts.set(plan.program_id, (counts.get(plan.program_id) ?? 0) + 1);
  return tnaProgramSchema
    .array()
    .parse(data)
    .map((program) => ({
      ...program,
      plan_count: counts.get(program.id) ?? 0,
    }));
}

/** K36/P-2: clusters no active program triggers; `lainnya` is a catch-all. */
export async function getTnaProgramCoverage(
  supabase: SupabaseClient,
): Promise<TnaProgramCoverage> {
  const triggered = new Set(
    (await listTnaPrograms(supabase)).flatMap((p) => p.trigger_clusters),
  );
  return {
    uncovered_clusters: rootCauseClusterIds.filter(
      (cluster) => cluster !== "lainnya" && !triggered.has(cluster),
    ),
  };
}

async function logProgramAction(
  args: CatalogWriteContext,
  verb: string,
  program: TnaProgram,
  type: "add" | "update",
) {
  await logActivity({
    user_id: args.actorId,
    user_name: args.actorName,
    action: `${verb} program TNA: ${program.code}`,
    module: "tna",
    type,
  });
}

export async function createTnaProgram(
  args: CatalogWriteContext & { input: CreateTnaProgram },
) {
  const input = createTnaProgramSchema.parse(args.input);
  const { data, error } = await supabaseAdmin.rpc("tna_create_program", {
    p_actor_id: args.actorId,
    p_program: input,
  });
  if (error) throwTnaRpcError(error);
  const program = tnaProgramSchema.parse(data);
  await logProgramAction(args, "Menambah", program, "add");
  return program;
}

export async function updateTnaProgram(
  args: CatalogWriteContext & { programId: string; input: UpdateTnaProgram },
) {
  const { expected_updated_at, ...patch } = updateTnaProgramSchema.parse(
    args.input,
  );
  const { data, error } = await supabaseAdmin.rpc("tna_update_program", {
    p_actor_id: args.actorId,
    p_program_id: args.programId,
    p_expected_updated_at: expected_updated_at,
    p_program: patch,
  });
  if (error) throwTnaRpcError(error);
  const program = tnaProgramSchema.parse(data);
  await logProgramAction(args, "Mengubah", program, "update");
  return program;
}

export async function setTnaProgramActive(
  args: CatalogWriteContext & {
    programId: string;
    active: boolean;
    expectedUpdatedAt: string;
  },
) {
  const { data, error } = await supabaseAdmin.rpc("tna_set_program_active", {
    p_actor_id: args.actorId,
    p_program_id: args.programId,
    p_expected_updated_at: args.expectedUpdatedAt,
    p_active: args.active,
  });
  if (error) throwTnaRpcError(error);
  const program = tnaProgramSchema.parse(data);
  await logProgramAction(
    args,
    args.active ? "Mengaktifkan" : "Menonaktifkan",
    program,
    "update",
  );
  return program;
}
