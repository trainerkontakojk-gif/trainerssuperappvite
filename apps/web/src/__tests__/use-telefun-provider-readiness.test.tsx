import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTelefunProviderReadiness } from "../routes/telefun/hooks/useTelefunProviderReadiness";

// Telefun no longer performs provider readiness probes: the hook is a
// compatibility stub that always reports "unavailable". These tests pin that
// retired contract so a future reintroduction of network probes is deliberate.
describe("useTelefunProviderReadiness (retired contract)", () => {
  it("always reports unavailable without performing any fetch", () => {
    const fetchImpl = vi.fn();
    const { result, rerender } = renderHook(
      ({ active }) => useTelefunProviderReadiness(active, { fetchImpl }),
      { initialProps: { active: true } },
    );

    expect(result.current.status).toBe("unavailable");
    expect(result.current.openai).toEqual({
      enabled: false,
      configured: false,
      ready: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    rerender({ active: false });
    expect(result.current.status).toBe("unavailable");
  });
});
