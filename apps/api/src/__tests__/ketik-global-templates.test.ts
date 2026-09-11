import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import {
  getGlobalKetikQuickTemplatesSnapshot,
  saveGlobalKetikQuickTemplates,
} from "../services/ketik/global-templates";

const storedTemplates = [
  {
    id: "admin-1",
    keyword: "salam-admin",
    content: "Selamat datang dari template standar admin.",
  },
];

function buildQuery(maybeSingle: ReturnType<typeof vi.fn>) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    maybeSingle,
    single: vi.fn(),
  };
}

describe("KETIK global quick templates", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("reads the singleton templates and exposes its version", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        quick_templates: storedTemplates,
        updated_at: "2026-09-10T10:00:00.000Z",
      },
      error: null,
    });
    mockFrom.mockReturnValue(buildQuery(maybeSingle));

    await expect(getGlobalKetikQuickTemplatesSnapshot()).resolves.toEqual({
      templates: storedTemplates,
      version: "2026-09-10T10:00:00.000Z",
    });
  });

  it("falls back to canonical defaults when the singleton has no row", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(buildQuery(maybeSingle));

    const result = await getGlobalKetikQuickTemplatesSnapshot();

    expect(result.version).toBe("absent");
    expect(result.templates.length).toBeGreaterThan(0);
    expect(result.templates[0]).toEqual(
      expect.objectContaining({ id: "qt-selesai" }),
    );
  });

  it("updates the singleton with a matching optimistic version", async () => {
    const update = vi.fn().mockReturnThis();
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          quick_templates: [],
          updated_at: "2026-09-10T10:00:00.000Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { updated_at: "2026-09-10T10:01:00.000Z" },
        error: null,
      });
    const query = buildQuery(maybeSingle);
    query.update = update;
    mockFrom.mockReturnValue(query);

    await expect(
      saveGlobalKetikQuickTemplates(
        storedTemplates,
        "2026-09-10T10:00:00.000Z",
      ),
    ).resolves.toBe("2026-09-10T10:01:00.000Z");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "default",
        quick_templates: storedTemplates,
      }),
    );
  });

  it("rejects a stale version without updating the singleton", async () => {
    const update = vi.fn().mockReturnThis();
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        quick_templates: storedTemplates,
        updated_at: "2026-09-10T10:02:00.000Z",
      },
      error: null,
    });
    const query = buildQuery(maybeSingle);
    query.update = update;
    mockFrom.mockReturnValue(query);

    await expect(
      saveGlobalKetikQuickTemplates(
        storedTemplates,
        "2026-09-10T10:00:00.000Z",
      ),
    ).rejects.toMatchObject({ code: "SETTINGS_CONFLICT", status: 409 });
    expect(update).not.toHaveBeenCalled();
  });

  it("uses defaults when persisted template JSON is invalid", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        quick_templates: [{ keyword: "missing-id" }],
        updated_at: "2026-09-10T10:00:00.000Z",
      },
      error: null,
    });
    mockFrom.mockReturnValue(buildQuery(maybeSingle));

    const result = await getGlobalKetikQuickTemplatesSnapshot();

    expect(result.templates).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "qt-selesai" })]),
    );
  });
});
