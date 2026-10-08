import { buildSnapshot, resolveIndicatorMetadata } from "./metrics";
import { isCountableFinding } from "../sidak/shared-constants";
import {
  loadIndicatorMetadata,
  loadTnaParameterContext,
  type ListTnaParametersArgs,
} from "./parameters";

export class TnaIndicatorNotFoundError extends Error {}

export async function getTnaParameterAnalysis(
  args: Omit<ListTnaParametersArgs, "listingScope"> & { indicatorId: string },
) {
  const { data: indicator, error } = await args.supabase
    .from("qa_indicators")
    .select("id")
    .eq("id", args.indicatorId)
    .eq("service_type", args.serviceType)
    .maybeSingle();
  if (error) throw error;
  if (!indicator) throw new TnaIndicatorNotFoundError();
  const { selectedBucket, comparisonBuckets } =
    await loadTnaParameterContext(args);
  const { master, rules } = await loadIndicatorMetadata({
    supabase: args.supabase,
    indicatorIds: [args.indicatorId],
    rows: selectedBucket.auditedRows,
  });
  const metadata = resolveIndicatorMetadata({
    indicatorId: args.indicatorId,
    rows: selectedBucket.auditedRows,
    master,
    rules,
  });
  const metrics = buildSnapshot({
    bucket: selectedBucket,
    comparisonBuckets,
    indicatorId: args.indicatorId,
    serviceType: args.serviceType,
    parameterName: metadata.name,
    category: metadata.category,
    computedAt: (args.now ?? new Date()).toISOString(),
  });
  const findings = selectedBucket.auditedRows.filter(
    (row) =>
      row.indicator_id === args.indicatorId &&
      row.is_phantom_padding !== true &&
      isCountableFinding(row),
  );
  return { metrics, findings, period: selectedBucket.period };
}
