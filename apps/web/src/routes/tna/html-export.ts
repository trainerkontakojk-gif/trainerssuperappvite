/**
 * Shared pieces for the self-contained HTML exports TNA builds in the browser
 * (EFEK program report, plan summary). Every value from the database goes
 * through `esc`, so names cannot inject markup into the file.
 */

export const esc = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Letters, digits, and dashes only, for a portable file name. */
export const fileSlug = (value: string) =>
  value.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

/** Local calendar date `YYYY-MM-DD` for file names. */
export function fileDate(now: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function downloadHtml(html: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
