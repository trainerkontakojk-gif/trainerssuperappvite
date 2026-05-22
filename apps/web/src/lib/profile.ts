export function normalizeProfileStatus(status?: string | null) {
  const value = status?.toLowerCase().trim() ?? "";
  if (value === "approved") return "active";
  if (value === "rejected") return "inactive";
  if (["active", "pending", "inactive"].includes(value)) return value;
  return null;
}
