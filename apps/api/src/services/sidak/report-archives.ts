import { supabaseAdmin } from "../../lib/supabase";
import { REPORT_ADMIN_ROLES } from "./shared-constants";

const adminRoles: readonly string[] = REPORT_ADMIN_ROLES;

type ReportArchiveInput = {
  userId: string;
  title: string;
  reportType: "data" | "ai";
  filterParams: Record<string, unknown>;
  reportData: Record<string, unknown>;
  reportHtml?: string;
  reportJson?: Record<string, unknown>;
};

export async function saveReportArchive(params: ReportArchiveInput) {
  const { data, error } = await supabaseAdmin
    .from("report_archives")
    .insert({
      user_id: params.userId,
      title: params.title,
      report_type: params.reportType,
      filter_params: params.filterParams,
      report_data: params.reportData,
      report_html: params.reportHtml ?? null,
      report_json: params.reportJson ?? null,
    })
    .select("id, title, report_type, created_at")
    .single();

  if (error) throw new Error(`Gagal menyimpan report: ${error.message}`);
  return data;
}

export async function getReportArchives(userId: string, role: string) {
  let query = supabaseAdmin
    .from("report_archives")
    .select("id, title, report_type, filter_params, created_at")
    .order("created_at", { ascending: false });

  if (!adminRoles.includes(role)) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Gagal memuat daftar report: ${error.message}`);
  return data ?? [];
}

export async function getReportArchiveById(
  archiveId: string,
  userId: string,
  role: string,
) {
  const { data, error } = await supabaseAdmin
    .from("report_archives")
    .select("*")
    .eq("id", archiveId)
    .single();

  if (error) return null;

  if (!adminRoles.includes(role) && data.user_id !== userId) return null;

  return data;
}

export async function deleteReportArchive(
  archiveId: string,
  userId: string,
  role: string,
) {
  let query = supabaseAdmin
    .from("report_archives")
    .delete()
    .eq("id", archiveId);

  if (!adminRoles.includes(role)) {
    query = query.eq("user_id", userId);
  }

  const { error } = await query;
  if (error) throw new Error(`Gagal menghapus report: ${error.message}`);
}
