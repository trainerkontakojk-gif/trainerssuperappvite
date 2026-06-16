import type { ApiResponse } from "@trainers/types";

type ResponseLike<TBody = unknown> = {
  status: number;
  headers: Headers;
  json(): Promise<TBody>;
  text(): Promise<string>;
};

type ResponseBody<TResponse extends ResponseLike> = Awaited<
  ReturnType<TResponse["json"]>
>;

export type SuccessResponse<TBody> = Extract<
  TBody,
  { success: true }
> extends { data: infer TData }
  ? TData
  : never;

/**
 * Error class for API-level errors with structured payload.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty response body");
  }
  return JSON.parse(trimmed);
}

/**
 * Normalise the JSON body of a Hono RPC response.
 *
 * The Hono API always returns the `ApiResponse<T>` envelope
 * (`{ success, data, error }`).  This helper:
 *
 * 1. Checks for non-JSON or empty responses (throws a descriptive error).
 * 2. If the envelope is `{ success: true, data }` → returns `data`.
 * 3. If the envelope is `{ success: false, error }` → throws `ApiError`.
 * 4. If the response can't be parsed → throws `ApiError` with `PARSE_ERROR`.
 *
 * @example
 * ```ts
 * const res = await rpcClient.v1.me.$get()
 * const data = await unwrapResponse(res)
 * // data is typed as the success-data of the /v1/me endpoint
 * ```
 */
export async function unwrapResponse<TResponse extends ResponseLike>(
  res: TResponse,
): Promise<SuccessResponse<ResponseBody<TResponse>>> {
  type Data = SuccessResponse<ResponseBody<TResponse>>;
  // Hono RPC client's $get()/etc return a Promise<ClientResponse>,
  // and unwrapResponse may receive the Promise directly rather than
  // the resolved ClientResponse.  Await it first so .headers works.
  if (res && typeof (res as any).then === "function") {
    res = (await (res as any)) as TResponse;
  }
  const contentType = res.headers.get("content-type") ?? "";

  // Empty body (204, 205)
  if (res.status === 204 || res.status === 205) {
    return undefined as Data;
  }

  let body: unknown;
  try {
    if (contentType.includes("application/json") || contentType.includes("application/")) {
      body = await res.json();
    } else {
      const text = await res.text().catch(() => "");
      if (!text) {
        throw new ApiError(
          "UNEXPECTED_FORMAT",
          `Expected JSON response but got ${contentType || "empty"}.`,
        );
      }

      try {
        body = parseJsonText(text);
      } catch {
        throw new ApiError(
          "UNEXPECTED_FORMAT",
          `Expected JSON response but got ${contentType || "empty"}. Body: ${text.slice(0, 200)}`,
        );
      }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "PARSE_ERROR",
      "Gagal memproses respons server. Silakan coba lagi.",
    );
  }

  // Validate envelope shape
  if (body === null || body === undefined || typeof body !== "object") {
    throw new ApiError(
      "INVALID_ENVELOPE",
      "Respons server tidak memiliki format yang diharapkan.",
    );
  }

  const envelope = body as ApiResponse<Data>;

  if (envelope.success === true) {
    return envelope.data;
  }

  // Error envelope
  const errorPayload = envelope.error ?? {
    code: "UNKNOWN_ERROR",
    message: "Terjadi kesalahan yang tidak diketahui.",
  };

  throw new ApiError(
    errorPayload.code,
    errorPayload.message,
    "details" in errorPayload ? errorPayload.details : undefined,
  );
}
