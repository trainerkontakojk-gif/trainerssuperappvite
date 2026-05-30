/**
 * Rounds a number to the specified decimal places.
 * Returns 0 for non-finite values (NaN, Infinity).
 */
export function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}
