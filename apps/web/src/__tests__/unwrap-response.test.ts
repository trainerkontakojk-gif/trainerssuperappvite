import { describe, it, expect, expectTypeOf } from "vitest";
import type { InferResponseType } from "hono/client";
import { rpcClient } from "../lib/api/rpc-client";
import {
  unwrapResponse,
  ApiError,
  type SuccessResponse,
} from "../lib/api/unwrap-response";

/**
 * Helper: create a minimal Response-like object that matches the
 * shape expected by `unwrapResponse` (status, headers, json, text).
 */
function makeResponse<TBody>(
  body: TBody,
  status = 200,
  contentType = "application/json",
) {
  return {
    status,
    headers: new Headers({ "content-type": contentType }),
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(
        typeof body === "string" ? body : JSON.stringify(body),
      ),
  };
}

describe("ApiError", () => {
  it("creates an error with code and message", () => {
    const err = new ApiError("NOT_FOUND", "Data tidak ditemukan");
    expect(err.message).toBe("Data tidak ditemukan");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.name).toBe("ApiError");
  });

  it("carries optional details", () => {
    const details = { field: "id" };
    const err = new ApiError("VALIDATION", "Invalid", details);
    expect(err.details).toEqual(details);
  });
});

describe("unwrapResponse", () => {
  it("derives success data from the Hono RPC endpoint type", () => {
    expectTypeOf(rpcClient).not.toBeAny();
    expectTypeOf(rpcClient.v1.me["access-status"].$get).toBeFunction();

    type EndpointResponse = InferResponseType<
      typeof rpcClient.v1.me["access-status"]["$get"],
      200
    >;
    type AccessStatusData = SuccessResponse<EndpointResponse>;

    expectTypeOf<AccessStatusData>().not.toBeAny();
    expectTypeOf<AccessStatusData>().toHaveProperty("ktp");
    expectTypeOf<AccessStatusData>().toHaveProperty("sidak");

    // @ts-expect-error unknown paths must be rejected by the RPC contract
    void rpcClient.v1.me["missing-endpoint"];
  });

  it("keeps the auth profile response typed", () => {
    type MeResponse = InferResponseType<
      typeof rpcClient.v1.me["$get"],
      200
    >;
    type MeData = SuccessResponse<MeResponse>;

    expectTypeOf<MeData["profile"]>().not.toBeAny();
    expectTypeOf<MeData["profile"]>().toHaveProperty("role");
    expectTypeOf<MeData["profile"]>().toHaveProperty("status");
  });

  it("returns data on success envelope", async () => {
    const data = await unwrapResponse(
      makeResponse({
        success: true as const,
        data: { id: "abc" },
      }),
    );

    expectTypeOf(data).toEqualTypeOf<{ id: string }>();
    expect(data).toEqual({ id: "abc" });
  });

  it("returns the data with primitive types", async () => {
    const data = await unwrapResponse(
      makeResponse({
        success: true as const,
        data: ["a", "b"],
      }),
    );

    expectTypeOf(data).toEqualTypeOf<string[]>();
    expect(data).toEqual(["a", "b"]);
  });

  it("throws ApiError on error envelope", async () => {
    await expect(
      unwrapResponse(
        makeResponse({
          success: false,
          error: { code: "FORBIDDEN", message: "Akses ditolak" },
        }),
      ),
    ).rejects.toThrow(ApiError);

    await expect(
      unwrapResponse(
        makeResponse({
          success: false,
          error: { code: "FORBIDDEN", message: "Akses ditolak" },
        }),
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Akses ditolak",
    });
  });

  it("throws ApiError with code UNKNOWN_ERROR when error object is missing", async () => {
    await expect(
      unwrapResponse(makeResponse({ success: false })),
    ).rejects.toMatchObject({
      code: "UNKNOWN_ERROR",
    });
  });

  it("returns undefined for 204 No Content", async () => {
    const result = await unwrapResponse(makeResponse("", 204));
    expect(result).toBeUndefined();
  });

  it("returns undefined for 205 Reset Content", async () => {
    const result = await unwrapResponse(makeResponse("", 205));
    expect(result).toBeUndefined();
  });

  it("throws ApiError on HTML content-type (SPA fallback)", async () => {
    const htmlBody = "<!DOCTYPE html><html>...</html>";
    const res = {
      status: 200,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      json: () => Promise.reject(new Error("Not JSON")),
      text: () => Promise.resolve(htmlBody),
    };

    await expect(unwrapResponse(res)).rejects.toThrow(ApiError);
    await expect(unwrapResponse(res)).rejects.toMatchObject({
      code: "UNEXPECTED_FORMAT",
    });
  });

  it("parses JSON body even when content-type is text/plain", async () => {
    const data = await unwrapResponse({
      status: 200,
      headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
      json: () => Promise.reject(new Error("Should not use json()")),
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            data: { id: "plain-json" },
          }),
        ),
    });

    expect(data).toEqual({ id: "plain-json" });
  });

  it("throws ApiError when body is not valid JSON", async () => {
    const res = {
      status: 200,
      headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
      json: () => Promise.reject(new Error("JSON parse error")),
      text: () => Promise.resolve("not json"),
    };

    await expect(unwrapResponse(res)).rejects.toThrow(ApiError);
    await expect(unwrapResponse(res)).rejects.toMatchObject({
      code: "UNEXPECTED_FORMAT",
    });
  });

  it("throws ApiError when body is null", async () => {
    await expect(
      unwrapResponse(makeResponse(null)),
    ).rejects.toMatchObject({
      code: "INVALID_ENVELOPE",
    });
  });

  it("throws ApiError when body is not an object", async () => {
    await expect(
      unwrapResponse(makeResponse("just a string")),
    ).rejects.toMatchObject({
      code: "INVALID_ENVELOPE",
    });
  });
});
