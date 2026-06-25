import { describe, expect, it } from "vitest";
import app from "../app";

function expectSecurityHeaders(res: Response) {
  expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  expect(res.headers.get("Permissions-Policy")).toContain("geolocation=()");
}

describe("app onError CORS safety net", () => {
  // Register a route that deliberately throws an unhandled exception
  app.get("/test-error-trigger", () => {
    throw new Error("Triggered unhandled test exception");
  });

  it("includes CORS headers in unhandled exception responses when request origin matches allowedOrigins", async () => {
    const res = await app.request("/api/test-error-trigger", {
      headers: {
        Origin: "http://localhost:3000",
      },
    });

    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expectSecurityHeaders(res);

    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  });

  it("does not emit credentialed CORS headers when request origin does not match", async () => {
    const res = await app.request("/api/test-error-trigger", {
      headers: {
        Origin: "http://invalid-origin.com",
      },
    });

    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expectSecurityHeaders(res);
  });

  it("does not emit credentialed CORS headers when Origin header is missing", async () => {
    const res = await app.request("/api/test-error-trigger");

    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expectSecurityHeaders(res);
  });

  it("applies security headers on normal API responses", async () => {
    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
  });
});
