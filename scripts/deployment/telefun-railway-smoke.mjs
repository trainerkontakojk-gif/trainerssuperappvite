const webUrl = process.env.WEB_URL;
const apiUrl = process.env.API_URL;
const telefunUrl = process.env.TELEFUN_WS_URL;

if (!webUrl || !apiUrl || !telefunUrl) {
  console.error("Error: WEB_URL, API_URL, and TELEFUN_WS_URL are required in env.");
  process.exit(1);
}

const checks = [
  { name: "web", url: webUrl },
  { name: "api", url: `${apiUrl.replace(/\/api\/v1$/, "")}/api/health` },
  { name: "telefun", url: telefunUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/ws$/, "") + "/health" },
];

console.log("[Smoke] Running service health checks...");

for (const check of checks) {
  try {
    const res = await fetch(check.url);
    if (!res.ok) {
      console.error(`[Smoke] ${check.name} health failed: ${res.status} ${check.url}`);
      process.exit(1);
    }
    console.log(`[Smoke] ${check.name} health OK: ${res.status}`);
  } catch (err) {
    console.error(`[Smoke] ${check.name} connection failed at ${check.url}:`, err);
    process.exit(1);
  }
}

console.log("[Smoke] All health checks passed!");
