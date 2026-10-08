import { createHash } from "node:crypto";
import { test } from "@playwright/test";

export async function tnaApiRequest<
  Input extends string | Request | URL,
  Init extends { headers?: HeadersInit },
  Result extends { status: number },
>(
  app: { request: (input: Input, init: Init) => Result | Promise<Result> },
  input: Input,
  init: Init,
): Promise<Result> {
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined,
  );
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  // The in-memory limiter is shared across specs; isolate its IP bucket per test
  // while keeping all requests within the same test subject to the real limit.
  const digest = createHash("sha256").update(test.info().testId).digest("hex");
  headers.set(
    "x-forwarded-for",
    `fd00:${digest.slice(0, 28).match(/.{4}/g)!.join(":")}`,
  );
  const response = await app.request(input, {
    ...init,
    headers: Object.fromEntries(headers),
  });
  return response;
}
