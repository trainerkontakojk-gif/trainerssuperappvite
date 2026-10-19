import type { EfekTrainingEntry } from "@trainers/types";
import { supabaseAdmin } from "../../lib/supabase";

type Row = {
  efek_sessions: {
    id: string;
    program_code: string;
    title: string;
    start_date: string;
    end_date: string;
    efek_programs: { name: string } | null;
  } | null;
};

/**
 * EFEK sessions one agent joined, newest first, for the SIDAK agent detail.
 * Callers gate on `tna.read` first: this reads with the service role because
 * the SIDAK quickview it feeds runs on the service role as well.
 */
export async function listEfekTrainingForAgent(
  pesertaId: string,
): Promise<EfekTrainingEntry[]> {
  const { data, error } = await supabaseAdmin
    .from("efek_participants")
    .select(
      "efek_sessions(id, program_code, title, start_date, end_date, efek_programs(name))",
    )
    .eq("peserta_id", pesertaId)
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[])
    .flatMap(({ efek_sessions: s }) =>
      s
        ? [
            {
              sessionId: s.id,
              programCode: s.program_code,
              programName: s.efek_programs?.name ?? s.program_code,
              title: s.title,
              startDate: s.start_date,
              endDate: s.end_date,
            },
          ]
        : [],
    )
    .sort(
      (a, b) =>
        b.startDate.localeCompare(a.startDate) ||
        a.title.localeCompare(b.title, "id"),
    );
}
