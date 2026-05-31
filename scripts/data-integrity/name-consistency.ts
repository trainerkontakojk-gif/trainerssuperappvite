/**
 * Compute Levenshtein (edit) distance between two strings.
 * Capped at first 100 characters to avoid O(n²) on very long strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const strA = a.slice(0, 100);
  const strB = b.slice(0, 100);

  const lenA = strA.length;
  const lenB = strB.length;

  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  // Single-row DP for space efficiency
  let prevRow: number[] = Array.from({ length: lenB + 1 }, (_, i) => i);
  let currRow: number[] = new Array(lenB + 1);

  for (let i = 1; i <= lenA; i++) {
    currRow[0] = i;
    for (let j = 1; j <= lenB; j++) {
      const cost = strA[i - 1] === strB[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost, // substitution
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[lenB];
}

/**
 * Check if one string is a substring of the other (case-insensitive).
 * Both strings must be at least `minLength` characters.
 * Returns false for exact matches (not a "substring" inconsistency).
 */
export function isSubstringMatch(
  a: string,
  b: string,
  minLength: number = 4,
): boolean {
  const lowerA = a.toLowerCase().trim();
  const lowerB = b.toLowerCase().trim();

  if (lowerA.length < minLength || lowerB.length < minLength) return false;
  if (lowerA === lowerB) return false;

  return lowerA.includes(lowerB) || lowerB.includes(lowerA);
}

/**
 * Detect whitespace issues in a name string.
 * Returns an array of issue descriptions, or empty array if clean.
 * Issues: leading/trailing whitespace, consecutive internal spaces.
 */
export function detectWhitespaceIssues(name: string): string[] {
  const issues: string[] = [];

  if (name !== name.trimStart()) {
    issues.push("leading whitespace");
  }
  if (name !== name.trimEnd()) {
    issues.push("trailing whitespace");
  }
  if (/\s{2,}/.test(name.trim())) {
    issues.push("consecutive internal spaces");
  }

  return issues;
}

/**
 * Detect if one name is an abbreviated form of another.
 * An abbreviation is when one variant has a single initial followed by a period
 * while the other has the full word for the same name segment.
 * Example: "J. Smith" vs "John Smith", "A. B. Charlie" vs "Alice Beatrice Charlie"
 */
export function detectAbbreviation(name1: string, name2: string): boolean {
  const parts1 = name1.trim().split(/\s+/);
  const parts2 = name2.trim().split(/\s+/);

  for (let i = 0; i < Math.min(parts1.length, parts2.length); i++) {
    const p1 = parts1[i];
    const p2 = parts2[i];

    // Pattern: single letter + period (e.g., "J." or "A.")
    const isAbbrev1 = /^[A-Za-z]\.$/.test(p1);
    const isAbbrev2 = /^[A-Za-z]\.$/.test(p2);

    if (isAbbrev1 && !isAbbrev2 && p2.length > 1) {
      if (p1[0].toLowerCase() === p2[0].toLowerCase()) {
        return true;
      }
    }
    if (isAbbrev2 && !isAbbrev1 && p1.length > 1) {
      if (p2[0].toLowerCase() === p1[0].toLowerCase()) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Derive canonical form of a name: trim whitespace, collapse consecutive spaces,
 * and apply title-case capitalization.
 */
export function deriveCanonicalForm(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed
    .split(" ")
    .map((word) => {
      if (word.length === 0) return word;
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
