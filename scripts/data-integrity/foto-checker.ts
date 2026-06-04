/** Concurrency limit for HEAD requests to avoid overwhelming the Storage API */
export const FOTO_BATCH_SIZE = 10;

/** Overall timeout for the check-fotos command (120 seconds) */
export const FOTO_OVERALL_TIMEOUT_MS = 120_000;

/** Per-request timeout for HEAD checks (5 seconds) */
export const FOTO_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Checks if a foto_url resolves to an existing Storage object via HEAD request.
 * Returns: 'valid' | 'broken' | 'unverified' with optional reason.
 */
export async function checkFotoUrl(
  supabaseUrl: string,
  fotoUrl: string,
): Promise<{ status: "valid" | "broken" | "unverified"; reason?: string }> {
  const storageUrl = `${supabaseUrl}/storage/v1/object/public/profiler-foto/${fotoUrl}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      FOTO_REQUEST_TIMEOUT_MS,
    );

    const response = await fetch(storageUrl, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { status: "valid" };
    } else if (response.status === 404) {
      return { status: "broken" };
    } else if (response.status >= 500) {
      return { status: "unverified", reason: `HTTP ${response.status}` };
    } else {
      // 4xx other than 404 treated as broken
      return { status: "broken" };
    }
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === "AbortError") {
      return { status: "unverified", reason: "timeout" };
    }
    return { status: "unverified", reason: error.message || "network error" };
  }
}

/**
 * Processes an array of items in batches with a given concurrency limit.
 * Stops processing new batches if shouldAbort() returns true.
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  shouldAbort: () => boolean,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    if (shouldAbort()) break;

    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
}
