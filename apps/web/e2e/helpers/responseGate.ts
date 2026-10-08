/** Gerbang per-test untuk menahan respons mock sampai `release()` dipanggil. */
export function createResponseGate(): {
  promise: Promise<void>;
  release: () => void;
} {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
