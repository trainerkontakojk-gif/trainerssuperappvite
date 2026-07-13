import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import PdktSimulation from "../routes/pdkt/simulation";
import type { PdktMailboxItem } from "@trainers/types";

const useApiMock = vi.hoisted(() => vi.fn());
const historyGetMock = vi.hoisted(() => vi.fn());
const evalGetMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());
const retryEvalPostMock = vi.hoisted(() => vi.fn());
let mailboxItems: PdktMailboxItem[];

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

vi.mock("../lib/api", () => ({
  pdktClient: {
    settings: { $get: vi.fn().mockResolvedValue(null) },
    history: {
      $get: historyGetMock,
      eval: { ":id": { $get: evalGetMock } },
      "retry-eval": { $post: retryEvalPostMock },
    },
  },
  unwrapResponse: (value: unknown) => value,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function mailboxItem(id: string, historyId: string): PdktMailboxItem {
  return {
    id,
    status: "replied",
    sender_name: `Sender ${id}`,
    sender_email: `${id}@example.com`,
    subject: `Subject ${id}`,
    created_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    inbound_email: { body: `Body ${id}` } as any,
    emails_thread: [{ body: `Body ${id}`, isAgent: false }] as any,
    history_id: historyId,
  } as PdktMailboxItem;
}

async function renderSimulation(onAfterActivity = vi.fn()) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <PdktSimulation onAfterActivity={onAfterActivity} />,
  });
  const routeTree = rootRoute.addChildren([indexRoute]);
  const router = createRouter({ routeTree });
  await router.load();
  const view = render(<RouterProvider router={router} />);

  await act(async () => {
    await Promise.resolve();
  });

  return {
    ...view,
    router,
  };
}

describe("PDKT evaluation polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    historyGetMock.mockResolvedValue([]);
    refetchMock.mockResolvedValue(undefined);
    retryEvalPostMock.mockResolvedValue({ success: true });
    mailboxItems = [
      mailboxItem("m1", "history-1"),
      mailboxItem("m2", "history-2"),
    ];
    useApiMock.mockImplementation((path: string) => ({
      data: path === "/pdkt/mailbox" ? mailboxItems : [],
      loading: false,
      refetch: refetchMock,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not overlap requests for a history while the previous poll is pending", async () => {
    const pending = deferred<unknown>();
    evalGetMock.mockReturnValue(pending.promise);

    await renderSimulation();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(evalGetMock).toHaveBeenCalledTimes(2);
    expect(
      evalGetMock.mock.calls.filter(
        ([request]) => request?.param?.id === "history-1",
      ),
    ).toHaveLength(1);

    pending.resolve({
      evaluation: null,
      evaluation_status: "processing",
      evaluation_error: null,
    });
  });

  it("batches refresh and activity notification when multiple histories finish together", async () => {
    evalGetMock.mockImplementation(({ param }: { param: { id: string } }) =>
      Promise.resolve({
        evaluation: { score: param.id === "history-1" ? 80 : 90 },
        evaluation_status: "completed",
        evaluation_error: null,
      }),
    );
    const onAfterActivity = vi.fn();

    await renderSimulation(onAfterActivity);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(historyGetMock).toHaveBeenCalledTimes(2);
    expect(onAfterActivity).toHaveBeenCalledTimes(1);
  });

  it("suppresses duplicate terminal side effects for the same history", async () => {
    mailboxItems = [mailboxItem("m1", "history-1")];
    evalGetMock.mockResolvedValue({
      evaluation: { score: 90 },
      evaluation_status: "completed",
      evaluation_error: null,
    });
    const onAfterActivity = vi.fn();

    await renderSimulation(onAfterActivity);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(evalGetMock).toHaveBeenCalledTimes(1);
    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(onAfterActivity).toHaveBeenCalledTimes(1);
  });

  it("ignores a terminal response that arrives after unmount", async () => {
    const pending = deferred<unknown>();
    evalGetMock.mockReturnValue(pending.promise);
    const onAfterActivity = vi.fn();
    const view = await renderSimulation(onAfterActivity);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    view.unmount();

    await act(async () => {
      pending.resolve({
        evaluation: { score: 100 },
        evaluation_status: "completed",
        evaluation_error: null,
      });
      await Promise.resolve();
    });

    expect(refetchMock).not.toHaveBeenCalled();
    expect(onAfterActivity).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still notifies activity when terminal refetch replaces mailbox data", async () => {
    mailboxItems = [mailboxItem("m1", "history-1")];
    evalGetMock
      .mockResolvedValueOnce({
        evaluation: null,
        evaluation_status: "processing",
        evaluation_error: null,
      })
      .mockResolvedValue({
        evaluation: { score: 90 },
        evaluation_status: "completed",
        evaluation_error: null,
      });
    const onAfterActivity = vi.fn();
    const view = await renderSimulation(onAfterActivity);
    refetchMock.mockImplementation(async () => {
      mailboxItems = [...mailboxItems];
      view.rerender(<RouterProvider router={view.router} />);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(onAfterActivity).toHaveBeenCalledTimes(1);
  });

  it("does not consume the stale failed status while a retry is starting", async () => {
    mailboxItems = [mailboxItem("m1", "history-1")];
    evalGetMock
      .mockResolvedValueOnce({
        evaluation: null,
        evaluation_status: "failed",
        evaluation_error: "Initial failure",
      })
      .mockResolvedValue({
        evaluation: null,
        evaluation_status: "processing",
        evaluation_error: null,
      });
    const retryRequest = deferred<unknown>();
    retryEvalPostMock.mockReturnValue(retryRequest.promise);

    await renderSimulation();

    fireEvent.click(screen.getByRole("button", { name: "Terbalas" }));
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Coba Lagi" }));

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(evalGetMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      retryRequest.resolve({ success: true });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(evalGetMock).toHaveBeenCalledTimes(2);
  });
});
