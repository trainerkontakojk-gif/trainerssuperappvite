export function buildSafeCloseMetadata(code: number, reason: Buffer | string) {
  const isInvalidSendCode = [1004, 1005, 1006, 1014, 1015].includes(code);
  const safeCode =
    ((code >= 3000 && code <= 4999) || (code >= 1000 && code <= 1013)) &&
    !isInvalidSendCode
      ? code
      : 1011;
  const rawReason = Buffer.isBuffer(reason) ? reason.toString() : reason;
  const safeReason =
    rawReason.trim() || "Gemini upstream closed without reason";

  return {
    code: safeCode,
    reason: safeReason.slice(0, 123),
  };
}
