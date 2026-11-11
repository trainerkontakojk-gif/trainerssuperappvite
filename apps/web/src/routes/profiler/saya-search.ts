/** Search params of `/profiler/saya`: `?view=slide` opens the slide view. */
export type KtpSayaSearch = { view?: "slide" };

export function validateKtpSayaSearch(
  search: Record<string, unknown>,
): KtpSayaSearch {
  return search.view === "slide" ? { view: "slide" } : {};
}
