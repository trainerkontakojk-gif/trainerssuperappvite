import { supabaseAdmin } from "../../lib/supabase";
import { getPeriods } from "./period-indicator";

export async function getRuleVersions(serviceType?: string) {
  let query = supabaseAdmin
    .from("qa_service_rule_versions")
    .select(
      "*, qa_periods(id, month, year)",
    )
    .order("version_number", { ascending: false });

  if (serviceType) query = query.eq("service_type", serviceType);
  const { data, error } = await query;
  if (error) throw new Error(`Gagal memuat versi aturan: ${error.message}`);

  if (data && data.length > 0) {
    const userIds = [...new Set(data.map((v: any) => v.created_by).filter(Boolean))];
    const profileMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      if (profiles) {
        for (const p of profiles) {
          profileMap.set(p.id, p.full_name ?? "");
        }
      }
    }

    const { data: indicatorRows } = await supabaseAdmin
      .from("qa_service_rule_indicators")
      .select("rule_version_id")
      .in(
        "rule_version_id",
        data.map((v: any) => v.id),
      );

    const countMap: Record<string, number> = {};
    if (indicatorRows) {
      for (const row of indicatorRows) {
        countMap[row.rule_version_id] =
          (countMap[row.rule_version_id] || 0) + 1;
      }
    }
    const mapped = data.map((v: any) => ({
      ...v,
      created_by_user: profileMap.get(v.created_by) ?? null,
      indicator_count: countMap[v.id] || 0,
    }));

    return mapped.sort((a: any, b: any) => {
      const getVersionPeriodSortValue = (version: any) => {
        const period = version.qa_periods;
        if (!period) return 0;
        return period.year * 100 + period.month;
      };

      const periodDelta = getVersionPeriodSortValue(b) - getVersionPeriodSortValue(a);
      if (periodDelta !== 0) return periodDelta;

      const statusRank = { draft: 3, published: 2, superseded: 1 } as const;
      const aRank = (statusRank as any)[a.status] || 0;
      const bRank = (statusRank as any)[b.status] || 0;
      const statusDelta = bRank - aRank;
      if (statusDelta !== 0) return statusDelta;

      if (b.version_number !== a.version_number) return b.version_number - a.version_number;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  return data ?? [];
}

export async function createRuleVersion(
  data: {
    service_type: string;
    effective_period_id?: string;
    critical_weight?: number;
    non_critical_weight?: number;
    scoring_mode?: string;
    change_reason?: string;
    source_version_id?: string;
  },
  userId: string,
) {
  const serviceType = data.service_type;

  let baseWeights: { critical_weight: number; non_critical_weight: number; scoring_mode: string };
  let baseIndicators: any[];
  let effectivePeriodId: string;

  if (data.source_version_id) {
    const { data: sourceVer, error: verErr } = await supabaseAdmin
      .from("qa_service_rule_versions")
      .select("*")
      .eq("id", data.source_version_id)
      .single();
    if (verErr) throw new Error(`Source version not found: ${verErr.message}`);
    if (sourceVer.status !== "published") {
      throw new Error("Revisi hanya bisa dibuat dari versi yang sudah dipublikasikan (published)");
    }

    baseWeights = {
      critical_weight: Number(sourceVer.critical_weight),
      non_critical_weight: Number(sourceVer.non_critical_weight),
      scoring_mode: sourceVer.scoring_mode,
    };
    effectivePeriodId = data.effective_period_id || sourceVer.effective_period_id;

    const { data: sourceInds, error: indsErr } = await supabaseAdmin
      .from("qa_service_rule_indicators")
      .select("*")
      .eq("rule_version_id", data.source_version_id);
    if (indsErr) throw new Error(`Failed to load source indicators: ${indsErr.message}`);
    baseIndicators = sourceInds || [];
  } else {
    if (data.effective_period_id) {
      effectivePeriodId = data.effective_period_id;
    } else {
      const periods = await getPeriods();
      if (periods.length === 0) {
        throw new Error("Belum ada periode audit. Silakan buat periode terlebih dahulu.");
      }
      effectivePeriodId = periods[0].id;
    }

    const { data: existingPublished } = await supabaseAdmin
      .from("qa_service_rule_versions")
      .select("id")
      .eq("service_type", serviceType)
      .eq("effective_period_id", effectivePeriodId)
      .eq("status", "published")
      .maybeSingle();

    if (existingPublished) {
      throw new Error("Versi published untuk periode ini sudah ada. Gunakan Create Revision.");
    }

    const { data: weights } = await supabaseAdmin
      .from("qa_service_weights")
      .select("*")
      .eq("service_type", serviceType)
      .maybeSingle();

    baseWeights = {
      critical_weight: data.critical_weight ?? Number(weights?.critical_weight ?? 0.5),
      non_critical_weight: data.non_critical_weight ?? Number(weights?.non_critical_weight ?? 0.5),
      scoring_mode: data.scoring_mode ?? weights?.scoring_mode ?? "weighted",
    };

    const { data: inds } = await supabaseAdmin
      .from("qa_indicators")
      .select("*")
      .eq("service_type", serviceType);
    baseIndicators = inds || [];
  }

  const { data: versions } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .select("version_number")
    .eq("service_type", serviceType)
    .eq("effective_period_id", effectivePeriodId)
    .order("version_number", { ascending: false })
    .limit(1);

  const versionNumber = (versions?.[0]?.version_number ?? 0) + 1;

  const { data: result, error } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .insert({
      service_type: serviceType,
      effective_period_id: effectivePeriodId,
      status: "draft",
      critical_weight: baseWeights.critical_weight,
      non_critical_weight: baseWeights.non_critical_weight,
      scoring_mode: baseWeights.scoring_mode,
      version_number: versionNumber,
      change_reason: data.change_reason,
      created_by: userId,
      created_from_version_id: data.source_version_id || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Gagal membuat versi aturan: ${error.message}`);

  if (baseIndicators.length > 0) {
    const newInds = baseIndicators.map((ind) => ({
      rule_version_id: result.id,
      service_type: serviceType,
      name: ind.name,
      category: ind.category,
      bobot: Number(ind.bobot),
      has_na: ind.has_na || false,
      threshold: ind.threshold || null,
      sort_order: ind.sort_order || 0,
      legacy_indicator_id: data.source_version_id
        ? (ind.legacy_indicator_id || null)
        : (ind.id || ind.legacy_indicator_id || null),
      created_by: userId,
    }));

    const { error: copyErr } = await supabaseAdmin
      .from("qa_service_rule_indicators")
      .insert(newInds);
    if (copyErr) {
      await supabaseAdmin.from("qa_service_rule_versions").delete().eq("id", result.id);
      throw new Error(`Gagal menduplikasi parameter: ${copyErr.message}`);
    }
  }

  return result;
}

export async function deleteRuleVersionDraft(id: string): Promise<void> {
  const { data: existing, error: loadError } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (loadError) throw new Error(`Gagal memuat versi aturan: ${loadError.message}`);
  if (!existing) throw new Error("Versi aturan tidak ditemukan");
  if (existing.status !== "draft") throw new Error("Hanya versi draft yang bisa dihapus");

  const { error } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .delete()
    .eq("id", id)
    .eq("status", "draft");

  if (error) throw new Error(`Gagal menghapus draft: ${error.message}`);
}

export async function updateRuleVersion(

  id: string,
  data: {
    critical_weight?: number;
    non_critical_weight?: number;
    scoring_mode?: string;
    change_reason?: string;
  },
  userId: string,
) {
  const { data: existing } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .select("status")
    .eq("id", id)
    .single();

  if (!existing) throw new Error("Versi aturan tidak ditemukan");
  if (existing.status !== "draft")
    throw new Error("Hanya versi draft yang bisa diedit");

  const { data: result, error } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .update({ ...data, updated_by: userId })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Gagal mengupdate versi aturan: ${error.message}`);
  return result;
}

export async function publishRuleVersion(
  id: string,
  userId: string,
  change_reason?: string,
  effective_period_id?: string,
) {
  const { data: existing } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .select("status, service_type, effective_period_id, version_number")
    .eq("id", id)
    .single();

  if (!existing) throw new Error("Versi aturan tidak ditemukan");
  if (existing.status !== "draft")
    throw new Error("Hanya versi draft yang bisa dipublikasikan");

  const now = new Date().toISOString();
  const targetPeriodId = effective_period_id || existing.effective_period_id;
  let targetVersionNumber = existing.version_number;

  if (effective_period_id && effective_period_id !== existing.effective_period_id) {
    const { data: versions } = await supabaseAdmin
      .from("qa_service_rule_versions")
      .select("version_number")
      .eq("service_type", existing.service_type)
      .eq("effective_period_id", effective_period_id)
      .order("version_number", { ascending: false })
      .limit(1);

    targetVersionNumber = (versions?.[0]?.version_number ?? 0) + 1;
  }

  const { data: publishedVersions } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .select("id")
    .eq("service_type", existing.service_type)
    .eq("effective_period_id", targetPeriodId)
    .eq("status", "published")
    .neq("id", id);

  if (publishedVersions && publishedVersions.length > 0) {
    const { error: supersedeError } = await supabaseAdmin
      .from("qa_service_rule_versions")
      .update({
        status: "superseded",
        superseded_by: userId,
        superseded_at: now,
        superseded_by_version_id: id,
      })
      .in(
        "id",
        publishedVersions.map((p) => p.id),
      );

    if (supersedeError)
      throw new Error(
        `Gagal menonaktifkan versi lama: ${supersedeError.message}`,
      );
  }

  const updates: Record<string, any> = {
    status: "published",
    published_by: userId,
    published_at: now,
    effective_period_id: targetPeriodId,
    version_number: targetVersionNumber,
  };
  if (change_reason !== undefined) updates.change_reason = change_reason;

  const { data: result, error } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error)
    throw new Error(`Gagal mempublikasikan versi aturan: ${error.message}`);
  return result;
}

export async function getRuleVersionMeta(serviceType: string) {
  const [indicatorResult, weightResult, versionResult] = await Promise.all([
    supabaseAdmin
      .from("qa_indicators")
      .select("id", { count: "exact", head: true })
      .eq("service_type", serviceType),
    supabaseAdmin
      .from("qa_service_weights")
      .select("service_type")
      .eq("service_type", serviceType)
      .maybeSingle(),
    supabaseAdmin
      .from("qa_service_rule_versions")
      .select("id, status")
      .eq("service_type", serviceType),
  ]);

  const versions = versionResult.data ?? [];
  return {
    service_type: serviceType,
    indicator_count: indicatorResult.count ?? 0,
    has_weight: Boolean(weightResult.data),
    draft_count: versions.filter((v) => v.status === "draft").length,
    published_count: versions.filter((v) => v.status === "published").length,
  };
}

export async function supersedeRuleVersion(
  id: string,
  userId: string,
  change_reason?: string,
) {
  const { data: existing } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .select("status")
    .eq("id", id)
    .single();

  if (!existing) throw new Error("Versi aturan tidak ditemukan");
  if (existing.status !== "published")
    throw new Error("Hanya versi published yang bisa di-supersede");

  const updates: Record<string, any> = {
    status: "superseded",
    superseded_by: userId,
    superseded_at: new Date().toISOString(),
  };
  if (change_reason !== undefined) updates.change_reason = change_reason;

  const { data: result, error } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error)
    throw new Error(`Gagal menonaktifkan versi aturan: ${error.message}`);
  return result;
}

export async function getRuleVersionIndicators(versionId: string) {
  const { data, error } = await supabaseAdmin
    .from("qa_service_rule_indicators")
    .select("*")
    .eq("rule_version_id", versionId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Gagal memuat indikator: ${error.message}`);
  return data ?? [];
}

export async function addRuleVersionIndicator(
  data: {
    rule_version_id: string;
    service_type: string;
    name: string;
    category: "critical" | "non_critical" | "none";
    bobot: number;
    has_na?: boolean;
    threshold?: number;
    sort_order?: number;
    legacy_indicator_id?: string;
  },
  userId: string,
) {
  const { data: result, error } = await supabaseAdmin
    .from("qa_service_rule_indicators")
    .insert({ ...data, created_by: userId })
    .select()
    .single();

  if (error) throw new Error(`Gagal menambah indikator: ${error.message}`);
  return result;
}

export async function deleteRuleVersionIndicator(id: string) {
  const { error } = await supabaseAdmin
    .from("qa_service_rule_indicators")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Gagal menghapus indikator: ${error.message}`);
}

export async function updateRuleVersionIndicator(
  id: string,
  data: {
    name?: string;
    category?: "critical" | "non_critical" | "none";
    bobot?: number;
    has_na?: boolean;
    threshold?: number;
    sort_order?: number;
  },
) {
  const { data: result, error } = await supabaseAdmin
    .from("qa_service_rule_indicators")
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Gagal memperbarui indikator: ${error.message}`);
  return result;
}
