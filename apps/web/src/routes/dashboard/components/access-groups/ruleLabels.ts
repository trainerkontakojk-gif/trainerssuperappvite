import type { AccessGroupItemRow } from "@trainers/types";

export const RULE_TYPE_LABELS: Record<AccessGroupItemRow["field_name"], string> = {
  tim: "Tim",
  service_type: "Layanan",
  batch_name: "Batch",
  peserta_id: "Agen",
};
