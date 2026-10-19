import type { SupabaseClient } from "@supabase/supabase-js";
import {
  efekImportInputSchema,
  efekMatchInputSchema,
  efekSessionInputSchema,
  type EfekImportInput,
  type EfekMatchInput,
  type EfekNameMatch,
  type EfekProgram,
  type EfekPesertaOption,
  type EfekSession,
  type EfekSessionDetail,
  type EfekSessionInput,
} from "@trainers/types";
import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { logActivity } from "../activity-log-service";
import { TnaServiceError } from "../tna/errors";

/** Reads use the caller JWT (RLS: admin/trainer). Writes go through guarded RPCs. */
interface EfekWriteContext {
  actorId: string;
  actorName: string;
}

const rpcErrors: Record<
  string,
  { status: 403 | 404 | 409 | 422; message: string }
> = {
  TNA_ACTOR_FORBIDDEN: {
    status: 403,
    message: "Akun ini tidak diizinkan mengubah data EFEK.",
  },
  EFEK_SESSION_NOT_FOUND: {
    status: 404,
    message: "Sesi pelatihan tidak ditemukan.",
  },
  EFEK_SESSION_EXISTS: {
    status: 409,
    message:
      "Sesi dengan program, nama, dan tanggal mulai yang sama sudah ada.",
  },
  EFEK_PROGRAM_INACTIVE: {
    status: 422,
    message: "Program pelatihan tidak dikenal atau sudah tidak aktif.",
  },
  EFEK_INVALID_PARTICIPANTS: {
    status: 422,
    message: "Peserta harus 1–300 orang yang terdaftar di Profiler.",
  },
  EFEK_INVALID_INPUT: {
    status: 422,
    message: "Data sesi pelatihan tidak valid. Periksa kembali isian.",
  },
};

function throwEfekRpcError(error: { message?: string }): never {
  const known = rpcErrors[error.message ?? ""];
  if (known)
    throw new TnaServiceError(error.message!, known.status, known.message);
  throw new Error("EFEK RPC failed");
}

export async function listEfekPrograms(
  supabase: SupabaseClient,
): Promise<EfekProgram[]> {
  const { data, error } = await supabase
    .from("efek_programs")
    .select("code, name, default_service_type, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("code");
  if (error) throw error;
  return data as EfekProgram[];
}

type SessionRow = Omit<EfekSession, "participant_count"> & {
  efek_participants: { count: number }[];
};
const SESSION_COLUMNS =
  "id, program_code, title, service_type, start_date, end_date, updated_at, efek_participants(count)";
const toSession = ({ efek_participants, ...row }: SessionRow): EfekSession => ({
  ...row,
  participant_count: efek_participants[0]?.count ?? 0,
});

export async function listEfekSessions(
  supabase: SupabaseClient,
  programCode?: string,
): Promise<EfekSession[]> {
  const rows = await fetchAllPages<SessionRow>({
    build: ({ from, to }) => {
      let query = supabase
        .from("efek_sessions")
        .select(SESSION_COLUMNS)
        .order("start_date", { ascending: false })
        .order("id")
        .range(from, to);
      if (programCode) query = query.eq("program_code", programCode);
      return query as unknown as PromiseLike<{
        data: SessionRow[] | null;
        error: { message: string } | null;
      }>;
    },
  });
  return rows.map(toSession);
}

export async function getEfekSession(
  supabase: SupabaseClient,
  id: string,
): Promise<EfekSessionDetail | null> {
  const { data, error } = await supabase
    .from("efek_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const participants = await fetchAllPages<{
    peserta_id: string;
    profiler_peserta: { nama: string; tim: string | null } | null;
  }>({
    build: ({ from, to }) =>
      supabase
        .from("efek_participants")
        .select("peserta_id, profiler_peserta(nama, tim)")
        .eq("session_id", id)
        .order("peserta_id")
        .range(from, to) as unknown as PromiseLike<{
        data: {
          peserta_id: string;
          profiler_peserta: { nama: string; tim: string | null } | null;
        }[];
        error: { message: string } | null;
      }>,
  });
  return {
    ...toSession(data as unknown as SessionRow),
    participants: participants
      .map((p) => ({
        peserta_id: p.peserta_id,
        nama: p.profiler_peserta?.nama ?? "",
        tim: p.profiler_peserta?.tim ?? null,
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id")),
  };
}

async function saveSessions(
  ctx: EfekWriteContext,
  sessions: (EfekSessionInput & { id?: string })[],
  mode: "create" | "merge" | "replace",
): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc("efek_save_sessions", {
    p_actor_id: ctx.actorId,
    p_sessions: sessions,
    p_mode: mode,
  });
  if (error) throwEfekRpcError(error);
  return data as string[];
}

async function log(ctx: EfekWriteContext, action: string, type: string) {
  await logActivity({
    user_id: ctx.actorId,
    user_name: ctx.actorName,
    action,
    module: "tna",
    type,
  });
}

export async function createEfekSession(
  ctx: EfekWriteContext,
  input: EfekSessionInput,
) {
  const parsed = efekSessionInputSchema.parse(input);
  const [id] = await saveSessions(ctx, [parsed], "create");
  await log(ctx, `Membuat sesi EFEK: ${parsed.title}`, "add");
  return id!;
}

export async function updateEfekSession(
  ctx: EfekWriteContext,
  id: string,
  input: EfekSessionInput,
) {
  const parsed = efekSessionInputSchema.parse(input);
  await saveSessions(ctx, [{ ...parsed, id }], "replace");
  await log(ctx, `Mengubah sesi EFEK: ${parsed.title}`, "update");
}

export async function deleteEfekSession(ctx: EfekWriteContext, id: string) {
  const { error } = await supabaseAdmin.rpc("efek_delete_session", {
    p_actor_id: ctx.actorId,
    p_session_id: id,
  });
  if (error) throwEfekRpcError(error);
  await log(ctx, `Menghapus sesi EFEK: ${id}`, "delete");
}

export async function importEfekSessions(
  ctx: EfekWriteContext,
  input: EfekImportInput,
) {
  const parsed = efekImportInputSchema.parse(input);
  const ids = await saveSessions(ctx, parsed.sessions, "merge");
  const participants = parsed.sessions.reduce(
    (sum, s) => sum + s.peserta_ids.length,
    0,
  );
  await log(
    ctx,
    `Mengimpor ${participants} peserta ke ${new Set(ids).size} sesi EFEK`,
    "add",
  );
  return { session_ids: [...new Set(ids)] };
}

/** Lowercase, drop punctuation, collapse spaces. */
export function normalizeEfekName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every input token is a prefix of a later token in the candidate, in order ("dimas p" → "dimas pratama"). */
function tokenPrefixMatch(input: string[], candidate: string[]) {
  let j = 0;
  for (const token of input) {
    while (j < candidate.length && !candidate[j]!.startsWith(token)) j++;
    if (j === candidate.length) return false;
    j++;
  }
  return true;
}

function withinEditDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      rowMin = Math.min(rowMin, cur[j]!);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length]! <= max;
}

const MAX_CANDIDATES = 5;

export async function matchEfekNames(
  supabase: SupabaseClient,
  input: EfekMatchInput,
): Promise<EfekNameMatch[]> {
  const { names } = efekMatchInputSchema.parse(input);
  const peserta = await fetchAllPages<EfekPesertaOption>({
    build: ({ from, to }) =>
      supabase
        .from("profiler_peserta")
        .select("id, nama, tim")
        .order("id")
        .range(from, to),
  });
  const indexed = peserta.map((p) => {
    const norm = normalizeEfekName(p.nama);
    return { option: p, norm, tokens: norm.split(" ") };
  });
  const exact = new Map<string, EfekPesertaOption[]>();
  for (const row of indexed)
    exact.set(row.norm, [...(exact.get(row.norm) ?? []), row.option]);

  return names.map((name) => {
    const norm = normalizeEfekName(name);
    const hits = exact.get(norm);
    if (hits?.length === 1)
      return { name, status: "cocok" as const, candidates: hits };
    if (hits && hits.length > 1)
      return {
        name,
        status: "pilih" as const,
        candidates: hits.slice(0, MAX_CANDIDATES),
      };
    if (!norm)
      return { name, status: "tidak_ditemukan" as const, candidates: [] };
    const tokens = norm.split(" ");
    const similar = indexed
      .filter(
        (row) =>
          tokenPrefixMatch(tokens, row.tokens) ||
          (row.norm[0] === norm[0] && withinEditDistance(norm, row.norm, 2)),
      )
      .slice(0, MAX_CANDIDATES)
      .map((row) => row.option);
    return {
      name,
      status: similar.length
        ? ("pilih" as const)
        : ("tidak_ditemukan" as const),
      candidates: similar,
    };
  });
}
