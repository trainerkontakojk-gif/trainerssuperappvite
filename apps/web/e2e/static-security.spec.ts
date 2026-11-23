import { expect, test } from "@playwright/test";

const PUBLIC_SITEMAP_URL = "https://trainerssuperapp.my.id/sitemap.xml";

// The generated bundle uses only loopback E2E service targets. Block any
// accidental third-party egress from the page under test.
test.beforeEach(async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Static security E2E requires an explicit local baseURL");
  }
  const allowedOrigin = new URL(baseURL).origin;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== allowedOrigin) {
      await route.abort();
      return;
    }
    await route.continue();
  });
});

test("public landing stays indexable while app routes are disallowed", async ({
  page,
}) => {
  const landing = await page.goto("/");
  expect(landing?.status()).toBe(200);
  expect(landing?.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(landing?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(landing?.headers()["x-robots-tag"] ?? "").not.toContain("noindex");

  const robotsResponse = await page.goto("/robots.txt");
  expect(robotsResponse?.status()).toBe(200);
  expect(robotsResponse?.headers()["content-type"]).toContain("text/plain");
  const robots = (await robotsResponse?.text()) ?? "";
  expect(robots).toContain("User-agent: *");
  for (const route of [
    "/account",
    "/api/",
    "/auth/callback",
    "/dashboard",
    "/ketik",
    "/monitoring",
    "/pdkt",
    "/pending",
    "/preview",
    "/profiler",
    "/qa-analyzer",
    "/reset-password",
    "/sidak",
    "/telefun",
    "/tna",
    "/unauthorized",
    "/waiting-approval",
  ]) {
    expect(robots).toContain(`Disallow: ${route}`);
  }
  expect(robots).toContain(`Sitemap: ${PUBLIC_SITEMAP_URL}`);
  expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m);

  const sitemapResponse = await page.goto("/sitemap.xml");
  expect(sitemapResponse?.status()).toBe(200);
  expect(sitemapResponse?.headers()["content-type"]).toMatch(/xml/);
  const sitemap = (await sitemapResponse?.text()) ?? "";
  expect(sitemap).toContain("<urlset");
  expect(sitemap).toContain("<loc>https://trainerssuperapp.my.id/</loc>");
  expect(sitemap).not.toMatch(/<loc>[^<]+\/(dashboard|sidak|profiler|tna|ketik|pdkt|telefun|monitoring)/);
});

test("app deep links preserve the SPA shell and are marked noindex", async ({
  page,
}) => {
  const response = await page.goto("/dashboard/users");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toContain("text/html");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator("#root")).toBeAttached();
});

test.describe("theme bootstrap", () => {
  test.use({ colorScheme: "light" });

  test("stored theme applies under the production CSP before the app bundle runs", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Content Security Policy"))
        violations.push(message.text());
    });
    await page.route("**/assets/*.js", (route) => route.abort());

    const response = await page.goto("/", { waitUntil: "load" });
    expect(response?.headers()["content-security-policy"]).toContain(
      "script-src 'self'",
    );

    const dom = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains("dark"),
      meta:
        document
          .querySelector('meta[name="color-scheme"]')
          ?.getAttribute("content") ?? null,
    }));
    expect(dom).toEqual({ dark: true, meta: "dark" });
    expect(violations).toEqual([]);
  });

  test("without a stored theme the bootstrap follows the system before the app bundle runs", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.route("**/assets/*.js", (route) => route.abort());

    await page.goto("/", { waitUntil: "load" });

    const dom = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains("dark"),
      meta:
        document
          .querySelector('meta[name="color-scheme"]')
          ?.getAttribute("content") ?? null,
      stored: localStorage.getItem("theme"),
    }));
    expect(dom).toEqual({ dark: true, meta: "light dark", stored: null });
  });

  test("the unhashed bootstrap script is revalidated instead of cached as immutable", async ({
    request,
  }) => {
    const response = await request.get("/theme-init.js");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(response.headers()["content-security-policy"]).toContain(
      "script-src 'self'",
    );
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });
});

test("dotfiles and common scanner paths return 404, not the SPA shell", async ({
  page,
}) => {
  for (const path of [
    "/.env",
    "/.env.local",
    "/.env/",
    "/.ENV",
    "/%2eenv",
    "/.git/config",
    "/.vite/manifest.json",
    "/wp-login.php",
    "/xmlrpc.php",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    expect(response?.headers()["content-type"], path).toContain("text/plain");
    expect(response?.headers()["cache-control"], path).toBe("no-store");
    expect(response?.headers()["content-security-policy"], path).toContain("default-src 'self'");
    await expect(page.getByText("Trainers SuperApp", { exact: false })).toHaveCount(0);
  }
});

test("missing static assets and file-like paths return a secured 404", async ({
  request,
}) => {
  for (const path of [
    "/assets/missing.js",
    "/assets/missing.css",
    "/assets/missing.map",
    "/missing.png",
    "/missing.woff2",
    "/missing.txt",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(response.headers()["content-type"], path).toContain("text/plain");
    expect(response.headers()["cache-control"], path).toContain("no-store");
    expect(response.headers()["content-security-policy"], path).toContain("default-src 'self'");
    expect(response.headers()["x-content-type-options"], path).toBe("nosniff");
    expect(await response.text(), path).not.toContain("<html");
  }
});

test("ambiguous path encodings are rejected and HEAD never returns the SPA shell", async ({
  request,
}) => {
  for (const path of ["/%252eenv", "/x%2f.env", "/x%5c.env", "/%00", "/%2e%2e/.env"]) {
    const response = await request.get(path);
    expect([400, 404], path).toContain(response.status());
    expect(response.headers()["content-type"], path).toContain("text/plain");
    expect(response.headers()["content-security-policy"], path).toContain("default-src 'self'");
    expect(await response.text(), path).not.toContain("<html");
  }

  const head = await request.head("/.env");
  expect(head.status()).toBe(404);
  expect(await head.body()).toHaveLength(0);
});
