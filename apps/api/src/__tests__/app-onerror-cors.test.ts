import { describe, expect, it } from "vitest";
import app from "../app";

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

    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  });

  it("falls back to the first origin from allowedOrigins when request origin does not match", async () => {
    const res = await app.request("/api/test-error-trigger", {
      headers: {
        Origin: "http://invalid-origin.com",
      },
    });

    expect(res.status).toBe(500);
    // Should fallback to the first allowed origin
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("falls back to the first origin from allowedOrigins when Origin header is missing", async () => {
    const res = await app.request("/api/test-error-trigger");

    expect(res.status).toBe(500);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });
});
