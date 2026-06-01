import { extractJsonObjectText as robustExtract } from "../../lib/ai-json";

export function extractJsonObjectText(raw: string): string {
  return robustExtract(raw);
}
