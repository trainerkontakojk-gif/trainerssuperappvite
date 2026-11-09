const TTL_MS = 60_000;

/** Process-local reference cache. Invalidation also fences in-flight loads. */
export function createTtlCache<K, V>(
  shouldCache: (value: V) => boolean = () => true,
) {
  const entries = new Map<K, { value: V; expires: number }>();
  const pending = new Map<K, Promise<V>>();
  let generation = 0;

  return {
    async get(key: K, load: () => Promise<V>): Promise<V> {
      const entry = entries.get(key);
      if (entry && entry.expires > Date.now())
        return structuredClone(entry.value);
      let promise = pending.get(key);
      if (!promise) {
        const started = generation;
        promise = Promise.resolve()
          .then(load)
          .then((value) => {
            if (generation === started && shouldCache(value)) {
              entries.set(key, {
                value: structuredClone(value),
                expires: Date.now() + TTL_MS,
              });
            }
            return value;
          });
        pending.set(key, promise);
        const current = promise;
        void promise
          .finally(() => {
            if (pending.get(key) === current) pending.delete(key);
          })
          .catch(() => {});
      }
      const value = await promise;
      return shouldCache(value) ? structuredClone(value) : value;
    },
    invalidate() {
      generation++;
      entries.clear();
      pending.clear();
    },
  };
}
