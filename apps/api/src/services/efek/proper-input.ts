/** Production parameter names: Proper Input… (Chat, Email, CSO) and Kemampuan Pencatatan… (Call). */
export function isProperInputIndicator(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized.startsWith("proper input") ||
    normalized.startsWith("kemampuan pencatatan")
  );
}
