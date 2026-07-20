export async function retryUsageAfterInFlight(
  flush: () => Promise<void>,
  isFlushed: () => boolean,
  maxAttempts = 2,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts && !isFlushed(); attempt += 1) {
    await flush();
  }
  return isFlushed();
}
