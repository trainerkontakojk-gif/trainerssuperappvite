import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockedUseLocation = vi.fn(() => ({ searchStr: "", pathname: "/" }));

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => mockedUseLocation(),
}));

import { useQueryParams } from "../hooks/useQueryParams";

describe("useQueryParams", () => {
  beforeEach(() => {
    mockedUseLocation.mockReturnValue({ searchStr: "", pathname: "/" });
  });

  it("returns empty object when no params", () => {
    mockedUseLocation.mockReturnValue({ searchStr: "", pathname: "/" });
    const { result } = renderHook(() => useQueryParams());
    expect(result.current).toEqual({});
  });

  it("parses single param", () => {
    mockedUseLocation.mockReturnValue({ searchStr: "?batch=Batch+1", pathname: "/" });
    const { result } = renderHook(() => useQueryParams());
    expect(result.current).toEqual({ batch: "Batch 1" });
  });

  it("parses multiple params", () => {
    mockedUseLocation.mockReturnValue({ searchStr: "?year=2025&month=3&service=call", pathname: "/" });
    const { result } = renderHook(() => useQueryParams());
    expect(result.current).toEqual({
      year: "2025",
      month: "3",
      service: "call",
    });
  });

  it("handles encoded values", () => {
    mockedUseLocation.mockReturnValue({ searchStr: "?name=Budi%20Santoso", pathname: "/" });
    const { result } = renderHook(() => useQueryParams());
    expect(result.current).toEqual({ name: "Budi Santoso" });
  });
});
