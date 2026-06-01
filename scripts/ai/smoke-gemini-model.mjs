import { GoogleGenAI } from "@google/genai";

const model = process.argv[2] || "gemini-3.5-flash";
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is not set.");
  process.exit(2);
}

const ai = new GoogleGenAI({ apiKey });

try {
  const response = await ai.models.generateContent({
    model,
    contents: "Reply with OK only.",
  });
  const text =
    typeof response.text === "function" ? response.text() : response.text;
  console.log(JSON.stringify({ model, ok: true, text }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    model,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
