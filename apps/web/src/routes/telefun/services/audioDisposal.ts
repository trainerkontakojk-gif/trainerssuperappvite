const ADMISSION_TIMEOUT_MS = 10_000;
const CLOSE_ATTEMPTS = 3;
const CLOSE_BACKOFF_MS = 100;

export class AudioCleanupPendingError extends Error {
  readonly code = "cleanup_pending";

  constructor() {
    super("Audio cleanup pending");
  }
}

/** Owners outlive React components; only confirmed release opens admission. */
const owners = new Set<TelefunAudioOwner>();

export class TelefunAudioOwner {
  readonly released: Promise<void>;
  private release!: () => void;
  private disposal: Promise<void> | null = null;

  constructor() {
    this.released = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  dispose(cleanup: () => Promise<void>): Promise<void> {
    if (!this.disposal) {
      this.disposal = Promise.resolve().then(cleanup);
      void this.disposal.then(
        () => {
          owners.delete(this);
          this.release();
        },
        (error: unknown) => {
          // Retain ownership, but let an explicit retry start fresh close attempts.
          // A pending disposal remains shared; only rejection clears the cache.
          this.disposal = null;
          console.error(
            "[Telefun] Audio disposal exhausted; admission blocked:",
            error,
          );
        },
      );
    }
    return this.disposal;
  }
}

export async function acquireTelefunAudio(): Promise<TelefunAudioOwner> {
  const deadline = Date.now() + ADMISSION_TIMEOUT_MS;
  while (owners.size > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([...owners].map((owner) => owner.released)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new AudioCleanupPendingError()),
            Math.max(0, deadline - Date.now()),
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    // Re-check after awaiting: only one waiter may acquire the next graph.
    if (owners.size > 0 && Date.now() >= deadline) {
      throw new AudioCleanupPendingError();
    }
  }
  const owner = new TelefunAudioOwner();
  owners.add(owner);
  return owner;
}

/** A pending native close is joined indefinitely; only rejection is retried. */
export async function closeTelefunAudioContexts(
  contexts: AudioContext[],
): Promise<void> {
  const results = await Promise.allSettled(
    contexts.map(async (context) => {
      for (let attempt = 1; attempt <= CLOSE_ATTEMPTS; attempt += 1) {
        if (context.state === "closed") return;
        try {
          await context.close();
          if ((context.state as AudioContextState) === "closed") return;
        } catch {
          // Actual rejected/synchronously thrown close, never a pending timeout.
        }
        console.warn("[Telefun] AudioContext close incomplete:", { attempt });
        if (attempt < CLOSE_ATTEMPTS) {
          await new Promise((resolve) =>
            setTimeout(resolve, CLOSE_BACKOFF_MS * attempt),
          );
        }
      }
      throw new AudioCleanupPendingError();
    }),
  );
  if (results.some((result) => result.status === "rejected")) {
    throw new AudioCleanupPendingError();
  }
}
