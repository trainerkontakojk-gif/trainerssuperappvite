import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
    })),
  },
  createAdminClient: vi.fn(),
}));

import {
  resolveEffectiveModuleStatus,
  resolveEffectiveModuleCreatedAt,
} from "../services/leader-access-service";
import type { LeaderRequestRow } from "../services/leader-access-service";

function makeRow(
  overrides: Partial<LeaderRequestRow> = {},
): LeaderRequestRow {
  return {
    id: "req-1",
    module: "sidak",
    status: "approved",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveEffectiveModuleStatus", () => {
  it("returns none when no rows exist", () => {
    expect(resolveEffectiveModuleStatus([], "sidak")).toBe("none");
  });

  it("returns approved when a module-specific approved row exists", () => {
    const rows = [makeRow({ module: "sidak", status: "approved" })];
    expect(resolveEffectiveModuleStatus(rows, "sidak")).toBe("approved");
  });

  it("returns approved when only an 'all' approved row exists", () => {
    const rows = [makeRow({ module: "all", status: "approved" })];
    expect(resolveEffectiveModuleStatus(rows, "sidak")).toBe("approved");
    expect(resolveEffectiveModuleStatus(rows, "ktp")).toBe("approved");
  });

  it("returns approved when 'all' row exists alongside a revoked row for the same module", () => {
    const rows = [
      makeRow({
        id: "req-2",
        module: "sidak",
        status: "revoked",
        updated_at: "2025-01-01T00:00:00Z",
      }),
      makeRow({
        id: "req-1",
        module: "all",
        status: "approved",
        updated_at: "2025-02-01T00:00:00Z",
      }),
    ];
    expect(resolveEffectiveModuleStatus(rows, "sidak")).toBe("approved");
  });

  it("approved beats revoked when both exist for same module (historical override)", () => {
    const rows = [
      makeRow({
        id: "req-2",
        module: "sidak",
        status: "revoked",
        updated_at: "2025-01-01T00:00:00Z",
        created_at: "2025-01-01T00:00:00Z",
      }),
      makeRow({
        id: "req-1",
        module: "sidak",
        status: "approved",
        updated_at: "2025-02-01T00:00:00Z",
        created_at: "2025-02-01T00:00:00Z",
      }),
    ];
    expect(resolveEffectiveModuleStatus(rows, "sidak")).toBe("approved");
  });

  it("approved beats rejected when both exist for same module", () => {
    const rows = [
      makeRow({
        id: "req-2",
        module: "sidak",
        status: "rejected",
        updated_at: "2025-01-01T00:00:00Z",
      }),
      makeRow({
        id: "req-1",
        module: "sidak",
        status: "approved",
        updated_at: "2025-02-01T00:00:00Z",
      }),
    ];
    expect(resolveEffectiveModuleStatus(rows, "sidak")).toBe("approved");
  });

  it("returns pending when only a pending row exists", () => {
    const rows = [makeRow({ module: "sidak", status: "pending" })];
    expect(resolveEffectiveModuleStatus(rows, "sidak")).toBe("pending");
  });

  it("pending for 'all' module returns pending for specific modules", () => {
    const rows = [makeRow({ module: "all", status: "pending" })];
    expect(resolveEffectiveModuleStatus(rows, "sidak")).toBe("pending");
    expect(resolveEffectiveModuleStatus(rows, "ktp")).toBe("pending");
  });

  it("returns most recent terminal status when no approved/pending", () => {
    const rows = [
      makeRow({
        id: "req-1",
        module: "sidak",
        status: "revoked",
        updated_at: "2025-02-01T00:00:00Z",
      }),
      makeRow({
        id: "req-2",
        module: "sidak",
        status: "rejected",
        updated_at: "2025-01-01T00:00:00Z",
      }),
    ];
    expect(resolveEffectiveModuleStatus(rows, "sidak")).toBe("revoked");
  });

  it("module-specific approved does NOT affect other modules", () => {
    const rows = [makeRow({ module: "sidak", status: "approved" })];
    expect(resolveEffectiveModuleStatus(rows, "ktp")).toBe("none");
  });

  it("module-specific revoked does NOT affect other modules", () => {
    const rows = [makeRow({ module: "sidak", status: "revoked" })];
    expect(resolveEffectiveModuleStatus(rows, "ktp")).toBe("none");
  });

  it("'all' module revoked returns revoked for both modules", () => {
    const rows = [makeRow({ module: "all", status: "revoked" })];
    expect(resolveEffectiveModuleStatus(rows, "sidak")).toBe("revoked");
    expect(resolveEffectiveModuleStatus(rows, "ktp")).toBe("revoked");
  });

  it("'all' approved beats sidak-specific rejected (historical override across modules)", () => {
    const rows = [
      makeRow({
        id: "req-3",
        module: "sidak",
        status: "rejected",
        updated_at: "2025-01-01T00:00:00Z",
      }),
      makeRow({
        id: "req-2",
        module: "sidak",
        status: "revoked",
        updated_at: "2025-01-15T00:00:00Z",
      }),
      makeRow({
        id: "req-1",
        module: "all",
        status: "approved",
        updated_at: "2025-02-01T00:00:00Z",
      }),
    ];
    expect(resolveEffectiveModuleStatus(rows, "sidak")).toBe("approved");
    expect(resolveEffectiveModuleStatus(rows, "ktp")).toBe("approved");
  });

  it("module-specific approved beats 'all' rejected", () => {
    const rows = [
      makeRow({
        id: "req-2",
        module: "all",
        status: "rejected",
        updated_at: "2025-01-01T00:00:00Z",
      }),
      makeRow({
        id: "req-1",
        module: "sidak",
        status: "approved",
        updated_at: "2025-02-01T00:00:00Z",
      }),
    ];
    expect(resolveEffectiveModuleStatus(rows, "sidak")).toBe("approved");
  });
});

describe("resolveEffectiveModuleCreatedAt", () => {
  it("returns null when rows array is empty", () => {
    expect(resolveEffectiveModuleCreatedAt([], "sidak", "none")).toBeNull();
  });

  it("returns created_at for the matching module-specific row", () => {
    const rows = [
      makeRow({
        module: "sidak",
        status: "approved",
        created_at: "2025-02-01T00:00:00Z",
      }),
    ];
    expect(
      resolveEffectiveModuleCreatedAt(rows, "sidak", "approved"),
    ).toBe("2025-02-01T00:00:00Z");
  });

  it("returns created_at from 'all' row for a specific module", () => {
    const rows = [
      makeRow({
        module: "all",
        status: "approved",
        created_at: "2025-01-01T00:00:00Z",
      }),
    ];
    expect(
      resolveEffectiveModuleCreatedAt(rows, "sidak", "approved"),
    ).toBe("2025-01-01T00:00:00Z");
  });

  it("returns null when status is none", () => {
    const rows = [makeRow({ module: "sidak", status: "revoked" })];
    expect(
      resolveEffectiveModuleCreatedAt(rows, "sidak", "none"),
    ).toBeNull();
  });
});
