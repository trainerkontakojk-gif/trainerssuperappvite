import { describe, expect, it } from "vitest";
import { resolveTelefunHealthCors } from "./health.js";

describe("Telefun health CORS", () => {
  it("allows every health origin for the wildcard policy without credentials", () => {
    const result = resolveTelefunHealthCors({
      allowedOrigins: "*",
      requestOrigin: "https://app.example.com",
    });

    expect(result).toEqual({
      allowed: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Accept, Content-Type",
      },
    });
    expect(result.headers).not.toHaveProperty(
      "Access-Control-Allow-Credentials",
    );
  });

  it("echoes only a normalized origin present in the configured allowlist", () => {
    const result = resolveTelefunHealthCors({
      allowedOrigins:
        "https://app.example.com/settings/, https://admin.example.com",
      requestOrigin: "https://app.example.com/telefun?session=secret",
    });

    expect(result).toEqual({
      allowed: true,
      headers: {
        "Access-Control-Allow-Origin": "https://app.example.com",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Accept, Content-Type",
        Vary: "Origin",
      },
    });
  });

  it("denies an origin outside the allowlist without reflecting it", () => {
    const result = resolveTelefunHealthCors({
      allowedOrigins: "https://app.example.com",
      requestOrigin: "https://attacker.example",
    });

    expect(result).toEqual({ allowed: false, headers: { Vary: "Origin" } });
    expect(JSON.stringify(result)).not.toContain("attacker.example");
  });

  it("allows server-side health checks without an Origin header", () => {
    expect(
      resolveTelefunHealthCors({
        allowedOrigins: "https://app.example.com",
        requestOrigin: undefined,
      }),
    ).toEqual({ allowed: true, headers: { Vary: "Origin" } });
  });
});
