export interface ShutdownCoordinatorOptions {
  timeoutMs: number;
  stopAccepting: () => void;
  closeHttp: () => Promise<void>;
  shutdownManager: () => Promise<void>;
  exit: (code: 0 | 1) => void;
  setTimeout?: (handler: () => void, delayMs: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
  logFailure?: (metadata: {
    operation: "shutdown";
    reason: "deadline" | "rejected";
    manager: "fulfilled" | "rejected";
    http: "fulfilled" | "rejected";
  }) => void;
}

export type ShutdownHandler = (signal: string) => Promise<void>;

export function createShutdownCoordinator(
  options: ShutdownCoordinatorOptions,
): ShutdownHandler {
  let shutdownPromise: Promise<void> | null = null;

  return (_signal: string): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = new Promise<void>((resolve) => {
      let stopError: unknown = null;
      try {
        options.stopAccepting();
      } catch (error) {
        stopError = error;
      }

      const managerShutdown = stopError
        ? Promise.reject(stopError)
        : Promise.resolve().then(options.shutdownManager);
      const httpShutdown = Promise.resolve().then(options.closeHttp);
      const observed = Promise.allSettled([managerShutdown, httpShutdown]);
      const setTimeoutFn =
        options.setTimeout ?? ((handler, delay) => setTimeout(handler, delay));
      const clearTimeoutFn =
        options.clearTimeout ??
        ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
      let timer: unknown = null;
      const deadline = new Promise<"deadline">((resolveDeadline) => {
        timer = setTimeoutFn(
          () => resolveDeadline("deadline"),
          options.timeoutMs,
        );
      });

      void Promise.race([observed, deadline]).then((result) => {
        if (result === "deadline") {
          options.logFailure?.({
            operation: "shutdown",
            reason: "deadline",
            manager: "rejected",
            http: "rejected",
          });
          options.exit(1);
          resolve();
          return;
        }

        const [managerResult, httpResult] = result;
        const manager = managerResult.status;
        const http = httpResult.status;
        if (manager === "rejected" || http === "rejected") {
          if (timer !== null) clearTimeoutFn(timer);
          options.logFailure?.({
            operation: "shutdown",
            reason: "rejected",
            manager,
            http,
          });
          options.exit(1);
          resolve();
          return;
        }

        if (timer !== null) clearTimeoutFn(timer);
        options.exit(0);
        resolve();
      });
    });

    return shutdownPromise;
  };
}
