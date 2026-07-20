import { timingSafeEqual } from "node:crypto";

/**
 * Authorize an inbound internal scoring request using a shared high-entropy
 * bearer token. The token MUST be sent by the API service and never exposed to
 * the browser. Comparison is length-gated then timing-safe to avoid trivial
 * oracle attacks. Neither token is ever logged.
 */
export function authorizeInternalScoring(
  authorization: string | null | undefined,
  expectedToken: string,
): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  if (expectedToken.length === 0) return false;

  const actual = Buffer.from(authorization.slice(7), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
