/** Test name patterns to detect (case-insensitive) */
export const TEST_NAME_PATTERNS = ["test", "dummy", "sample", "placeholder", "lorem"];

/** Test email domains */
export const TEST_EMAIL_DOMAINS = ["@example.com", "@test.com", "@mailinator.com"];

/**
 * Checks if a name field contains any test/dummy patterns (case-insensitive).
 * Returns the matched pattern or null if no match.
 */
export function matchesTestNamePattern(
  name: string | null | undefined,
): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const pattern of TEST_NAME_PATTERNS) {
    if (lower.includes(pattern)) {
      return `contains "${pattern}"`;
    }
  }
  return null;
}

/**
 * Checks if an email contains test domain patterns or "+test" substring.
 * Returns the matched pattern or null if no match.
 */
export function matchesTestEmailPattern(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const lower = email.toLowerCase();

  // Check test domains
  for (const domain of TEST_EMAIL_DOMAINS) {
    if (lower.endsWith(domain)) {
      return `domain "${domain}"`;
    }
  }

  // Check "+test" substring
  if (lower.includes("+test")) {
    return 'contains "+test"';
  }

  return null;
}

/**
 * Checks if a name consists solely of repeated characters or is a single character.
 * Examples: "aaa", "x", "bbb", "ZZZZ"
 * Returns the matched pattern or null if no match.
 */
export function matchesRepeatedCharPattern(
  name: string | null | undefined,
): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;

  // Single character name
  if (trimmed.length === 1) {
    return "single character name";
  }

  // All same character (case-insensitive)
  const firstChar = trimmed[0].toLowerCase();
  const allSame = trimmed
    .split("")
    .every((ch) => ch.toLowerCase() === firstChar);
  if (allSame) {
    return "repeated character name";
  }

  return null;
}
