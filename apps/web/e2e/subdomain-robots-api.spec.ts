import { once } from "node:events";
import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { bootLocalService } from "./helpers/bootLocalService";

// The API and Telefun hosts have no crawlable content, so each serves a
// host-root robots.txt that disallows everything. Both real entrypoints boot on
// loopback with fixture-only env and non-loopback egress denied.
const ROBOTS = "User-agent: *\nDisallow: /\n";

async function supabaseStub() {
  // Startup jobs may call Supabase; answer locally so nothing leaves loopback.
  const server = createServer((_req, res) =>
    res.writeHead(503, { "Content-Type": "application/json" }).end("{}"),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const services = [
  { service: "api", health: "/api/health", unknown: "/api/no-such-route" },
  { service: "telefun", health: "/health", unknown: "/no-such-route" },
] as const;

for (const { service, health, unknown } of services) {
  test(`${service}: robots.txt melarang semua crawler tanpa mengubah health/404`, async ({
    baseURL: _baseURL,
  }, testInfo) => {
    const supabase = await supabaseStub();
    const app = bootLocalService(service, supabase.url);
    try {
      const url = await app.url();

      const robots = await fetch(`${url}/robots.txt`);
      expect(robots.status).toBe(200);
      expect(robots.headers.get("content-type")).toMatch(/^text\/plain/);
      expect(robots.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await robots.text()).toBe(ROBOTS);

      const head = await fetch(`${url}/robots.txt`, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");

      const post = await fetch(`${url}/robots.txt`, { method: "POST" });
      expect(post.status).not.toBe(200);
      expect(await post.text()).not.toContain("Disallow");

      expect((await fetch(`${url}${health}`)).status).toBe(200);
      const missing = await fetch(`${url}${unknown}`);
      expect(missing.status).toBe(404);
      if (service === "api") {
        expect(await missing.json()).toMatchObject({
          success: false,
          error: { code: "NOT_FOUND" },
        });
      }
    } finally {
      await app.close();
      await testInfo.attach("service-log", {
        body: app.log(),
        contentType: "text/plain",
      });
      await supabase.close();
    }
  });
}
