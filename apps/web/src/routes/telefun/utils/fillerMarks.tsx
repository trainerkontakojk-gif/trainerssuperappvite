import type { ReactNode } from "react";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pola kata pengisi utuh (bukan potongan kata lain), mis. "eee" tidak cocok
 * dengan "keeenam". `null` bila tidak ada contoh yang bisa dicari.
 */
export function buildFillerPattern(examples: readonly string[]): RegExp | null {
  const words = [
    ...new Set(examples.map((example) => example.trim()).filter(Boolean)),
  ]
    // Frasa panjang dulu supaya "jadi gini" tidak terpotong oleh "jadi".
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (words.length === 0) return null;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(${words.join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );
}

/**
 * Sorot kata pengisi yang benar-benar ada di kalimat. Bila tidak ada yang
 * cocok, teks dikembalikan apa adanya: tidak ada sorotan karangan.
 */
export function withFillerMarks(
  text: string,
  pattern: RegExp | null,
): ReactNode {
  if (!pattern) return text;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <mark
        key={start}
        className="rounded-sm bg-chart-orange/15 px-0.5 text-foreground underline decoration-chart-orange decoration-2 underline-offset-4"
      >
        {match[0]}
      </mark>,
    );
    last = start + match[0].length;
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
