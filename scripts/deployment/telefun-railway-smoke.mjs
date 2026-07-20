const webUrl = process.env.WEB_URL;
const apiUrl = process.env.API_URL;
const telefunUrl = process.env.TELEFUN_WS_URL;
const expectOpenAIReady = process.env.TELEFUN_EXPECT_OPENAI_READY === "true";

if (!webUrl || !apiUrl || !telefunUrl) {
  console.error("Error: WEB_URL, API_URL, and TELEFUN_WS_URL are required in env.");
  process.exit(1);
}

function telefunHealthUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error("TELEFUN_WS_URL must use ws:// or wss://");
  }
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  parsed.pathname = "/health";
  parsed.search = "";
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

const checks = [
  { name: "web", url: webUrl },
  { name: "api", url: `${apiUrl.replace(/\/api\/v1$/, "")}/api/health` },
  { name: "telefun", url: telefunHealthUrl(telefunUrl) },
];

console.log("[Smoke] Running service health checks...");

for (const check of checks) {
  try {
    const res = await fetch(check.url);
    if (!res.ok) {
      console.error(`[Smoke] ${check.name} health failed: ${res.status} ${check.url}`);
      process.exit(1);
    }
    if (check.name === "telefun") {
      const payload = await res.json();
      const openai = payload?.readiness?.providers?.openai;
      console.log(
        `[Smoke] telefun OpenAI enabled=${Boolean(openai?.enabled)} configured=${Boolean(openai?.configured)} ready=${Boolean(openai?.ready)}`,
      );
      if (
        expectOpenAIReady &&
        !(openai?.enabled === true &&
          openai?.configured === true &&
          openai?.ready === true)
      ) {
        console.error(
          "[Smoke] Telefun OpenAI readiness was required but is not ready.",
        );
        process.exit(1);
      }
    }
    console.log(`[Smoke] ${check.name} health OK: ${res.status}`);
  } catch (err) {
    console.error(`[Smoke] ${check.name} connection failed at ${check.url}:`, err);
    process.exit(1);
  }
}

console.log("[Smoke] All health checks passed!");
