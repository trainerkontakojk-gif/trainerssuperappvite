export function sidakRankingUrl(serviceType?: string, year?: number): string {
  const params = new URLSearchParams();
  if (serviceType) params.set("service_type", serviceType);
  if (year) params.set("year", String(year));
  const query = params.toString();
  return query ? `/sidak/ranking?${query}` : "/sidak/ranking";
}
