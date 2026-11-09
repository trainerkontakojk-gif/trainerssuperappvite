const listeners = new Set<() => void>();

export function subscribeKetikReviewQueued(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyKetikReviewQueued(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A local wake must never change the enqueue response.
    }
  }
}
