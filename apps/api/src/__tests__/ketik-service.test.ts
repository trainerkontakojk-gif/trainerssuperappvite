import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

import * as ketikService from "../services/ketik-service";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";

describe("KETIK Service - Settings", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  describe("getSettings", () => {
    it("returns default settings when no row exists", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      });
      const settings = await ketikService.getSettings("user1");
      expect(settings.scenarios).toHaveLength(6);
      expect(settings.selectedModel).toBe("gemini-3.8-flash");
      expect(settings.simulationDuration).toBe(5);
    });

    it("keeps the historical default fallback when the settings read fails", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: { message: "DB error" } }),
      });

      await expect(ketikService.getSettings("user1")).resolves.toEqual(
        expect.objectContaining({
          selectedModel: "gemini-3.8-flash",
          simulationDuration: 5,
        }),
      );
    });

    it("returns a settings snapshot with an absent version when no row exists", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      await expect(ketikService.getSettingsSnapshot("user1")).resolves.toEqual({
        settings: expect.objectContaining({
          selectedModel: "gemini-3.8-flash",
        }),
        version: "absent",
        globalTemplatesVersion: "absent",
      });
    });

    it("returns stored settings when row exists", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            settings: {
              ketik: {
                selectedModel: "openai/gpt-4o-mini",
                simulationDuration: 10,
                responsePacingMode: "training_fast",
              },
            },
          },
          error: null,
        }),
      });
      const settings = await ketikService.getSettings("user1");
      expect(settings.selectedModel).toBe("gpt-5.4-mini");
      expect(settings.simulationDuration).toBe(10);
      expect(settings.responsePacingMode).toBe("training_fast");
    });

    it("merges global quick templates with a user's personal template list", async () => {
      const userQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            settings: {
              ketik: {
                quickTemplates: [
                  {
                    id: "personal-1",
                    keyword: "personal",
                    content: "Template pribadi",
                  },
                ],
              },
            },
          },
          error: null,
        }),
      };
      const globalQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            quick_templates: [
              {
                id: "admin-1",
                keyword: "standar",
                content: "Template standar admin",
              },
            ],
            updated_at: "2026-09-10T10:00:00.000Z",
          },
          error: null,
        }),
      };
      mockFrom.mockImplementation((table: string) =>
        table === "user_settings" ? userQuery : globalQuery,
      );

      const snapshot = await ketikService.getSettingsSnapshot("user1");

      expect(snapshot.settings.quickTemplates).toEqual([
        {
          id: "admin-1",
          keyword: "standar",
          content: "Template standar admin",
        },
        {
          id: "personal-1",
          keyword: "personal",
          content: "Template pribadi",
        },
      ]);
      expect(snapshot.settings.personalQuickTemplates).toEqual([
        {
          id: "personal-1",
          keyword: "personal",
          content: "Template pribadi",
        },
      ]);
      expect(snapshot.settings.globalQuickTemplates).toEqual([
        {
          id: "admin-1",
          keyword: "standar",
          content: "Template standar admin",
        },
      ]);
      expect(snapshot.globalTemplatesVersion).toBe("2026-09-10T10:00:00.000Z");
    });

    it("keeps legacy personal copies from shadowing global templates", async () => {
      const globalTemplate = {
        id: "qt-selesai",
        keyword: "selesai",
        content: "Template standar terbaru",
      };
      const legacyCopy = {
        id: "qt-selesai",
        keyword: "selesai",
        content: "Template personal lama",
      };
      const personalTemplate = {
        id: "personal-1",
        keyword: "personal",
        content: "Template pribadi",
      };
      const userQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            settings: {
              ketik: { quickTemplates: [legacyCopy, personalTemplate] },
            },
          },
          error: null,
        }),
      };
      const globalQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            quick_templates: [globalTemplate],
            updated_at: "2026-09-10T10:00:00.000Z",
          },
          error: null,
        }),
      };
      mockFrom.mockImplementation((table: string) =>
        table === "user_settings" ? userQuery : globalQuery,
      );

      const snapshot = await ketikService.getSettingsSnapshot("user1");

      expect(snapshot.settings.quickTemplates).toEqual([
        globalTemplate,
        personalTemplate,
      ]);
      expect(snapshot.settings.personalQuickTemplates).toEqual([
        legacyCopy,
        personalTemplate,
      ]);
      expect(snapshot.settings.globalQuickTemplates).toEqual([globalTemplate]);
    });

    it("preserves a user's stored template list when saving other settings", async () => {
      const personalTemplates = [
        {
          id: "personal-1",
          keyword: "personal",
          content: "Template pribadi",
        },
      ];
      const update = vi.fn().mockReturnThis();
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValueOnce({
            data: {
              settings: {
                ketik: { quickTemplates: personalTemplates },
              },
              updated_at: "2026-09-10T10:00:00.000Z",
            },
            error: null,
          })
          .mockResolvedValueOnce({
            data: { updated_at: "2026-09-10T10:01:00.000Z" },
            error: null,
          }),
        update,
      };
      mockFrom.mockReturnValue(query);

      await ketikService.saveSettings("user1", DEFAULT_KETIK_SETTINGS);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            ketik: expect.objectContaining({
              quickTemplates: personalTemplates,
            }),
          }),
        }),
      );
    });

    it("persists the submitted personal template list without storing transport metadata", async () => {
      const personalTemplates = [
        {
          id: "personal-2",
          keyword: "follow-up",
          content: "Saya bantu cek kembali ya.",
        },
      ];
      const insert = vi.fn().mockReturnThis();
      const select = vi.fn().mockReturnThis();
      const single = vi.fn().mockResolvedValue({
        data: { user_id: "user1", updated_at: "2026-09-10T10:02:00.000Z" },
        error: null,
      });
      mockFrom.mockReturnValue({
        select,
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert,
        single,
      });

      await ketikService.saveSettings("user1", {
        ...DEFAULT_KETIK_SETTINGS,
        quickTemplates: [
          ...DEFAULT_KETIK_SETTINGS.quickTemplates,
          ...personalTemplates,
        ],
        personalQuickTemplates: personalTemplates,
      });

      expect(insert).toHaveBeenCalledWith({
        user_id: "user1",
        settings: {
          ketik: {
            ...DEFAULT_KETIK_SETTINGS,
            quickTemplates: personalTemplates,
          },
        },
        updated_at: expect.any(String),
      });
    });

    it("preserves legacy global-key copies when saving new personal templates", async () => {
      const legacyCopy = {
        id: "qt-selesai",
        keyword: "selesai",
        content: "Template personal lama",
      };
      const globalTemplate = {
        id: "qt-selesai",
        keyword: "selesai",
        content: "Template standar terbaru",
      };
      const personalTemplate = {
        id: "personal-3",
        keyword: "pribadi-baru",
        content: "Template pribadi baru",
      };
      const update = vi.fn().mockReturnThis();
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi
          .fn()
          .mockResolvedValueOnce({
            data: {
              settings: { ketik: { quickTemplates: [legacyCopy] } },
              updated_at: "2026-09-10T10:00:00.000Z",
            },
            error: null,
          })
          .mockResolvedValueOnce({
            data: { updated_at: "2026-09-10T10:03:00.000Z" },
            error: null,
          }),
        update,
      };
      const globalQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            quick_templates: [globalTemplate],
            updated_at: "2026-09-10T10:00:00.000Z",
          },
          error: null,
        }),
      };
      mockFrom.mockImplementation((table: string) =>
        table === "user_settings" ? query : globalQuery,
      );

      await ketikService.saveSettings("user1", {
        ...DEFAULT_KETIK_SETTINGS,
        quickTemplates: [globalTemplate, personalTemplate],
        globalQuickTemplates: [globalTemplate],
        personalQuickTemplates: [personalTemplate],
      });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            ketik: expect.objectContaining({
              quickTemplates: [legacyCopy, personalTemplate],
            }),
          }),
        }),
      );
    });
  });

  describe("saveSettings", () => {
    it("inserts settings when the user has no settings row", async () => {
      const insert = vi.fn().mockReturnThis();
      const select = vi.fn().mockReturnThis();
      const single = vi.fn().mockResolvedValue({
        data: { user_id: "user1", updated_at: "2026-07-29T08:01:00.000Z" },
        error: null,
      });
      const maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue({
        select,
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
        insert,
        single,
      });

      await expect(
        ketikService.saveSettings("user1", DEFAULT_KETIK_SETTINGS),
      ).resolves.toBe("2026-07-29T08:01:00.000Z");

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user1",
          settings: { ketik: DEFAULT_KETIK_SETTINGS },
        }),
      );
      expect(select).toHaveBeenCalled();
    });

    it("preserves other namespaces and updates only the version that was read", async () => {
      const version = "2026-07-29T08:00:00.000Z";
      const update = vi.fn().mockReturnThis();
      const eq = vi.fn().mockReturnThis();
      const select = vi.fn().mockReturnThis();
      const maybeSingle = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            settings: { pdkt: { selectedModel: "pdkt-model" } },
            updated_at: version,
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            user_id: "user1",
            updated_at: "2026-07-29T08:01:00.000Z",
          },
          error: null,
        });
      const upsert = vi.fn();
      mockFrom.mockReturnValue({
        select,
        eq,
        maybeSingle,
        update,
        upsert,
      });

      await expect(
        ketikService.saveSettings("user1", DEFAULT_KETIK_SETTINGS),
      ).resolves.toBe("2026-07-29T08:01:00.000Z");

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user1",
          settings: {
            pdkt: { selectedModel: "pdkt-model" },
            ketik: DEFAULT_KETIK_SETTINGS,
          },
        }),
      );
      expect(eq).toHaveBeenCalledWith("updated_at", version);
      expect(upsert).not.toHaveBeenCalled();
    });

    it("rejects a stale client version even when its request starts later", async () => {
      const version = "2026-07-29T08:00:00.000Z";
      const newerVersion = "2026-07-29T08:01:00.000Z";
      const update = vi.fn().mockReturnThis();
      const maybeSingle = vi
        .fn()
        .mockResolvedValueOnce({
          data: { settings: {}, updated_at: version },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { user_id: "user1", updated_at: newerVersion },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { settings: {}, updated_at: newerVersion },
          error: null,
        });
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
        update,
      });

      await expect(
        ketikService.saveSettings("user1", DEFAULT_KETIK_SETTINGS, version),
      ).resolves.toBe(newerVersion);
      await expect(
        ketikService.saveSettings("user1", DEFAULT_KETIK_SETTINGS, version),
      ).rejects.toMatchObject({ code: "SETTINGS_CONFLICT", status: 409 });
      expect(update).toHaveBeenCalledTimes(1);
    });

    it("rejects an absent client version when a row already exists", async () => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { settings: {}, updated_at: "2026-07-29T08:00:00.000Z" },
        error: null,
      });
      const update = vi.fn().mockReturnThis();
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
        update,
      });

      await expect(
        ketikService.saveSettings("user1", DEFAULT_KETIK_SETTINGS, "absent"),
      ).rejects.toMatchObject({ code: "SETTINGS_CONFLICT", status: 409 });
      expect(update).not.toHaveBeenCalled();
    });

    it("rejects an ISO client version when no row exists", async () => {
      const maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: null });
      const insert = vi.fn().mockReturnThis();
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
        insert,
      });

      await expect(
        ketikService.saveSettings(
          "user1",
          DEFAULT_KETIK_SETTINGS,
          "2026-07-29T08:00:00.000Z",
        ),
      ).rejects.toMatchObject({ code: "SETTINGS_CONFLICT", status: 409 });
      expect(insert).not.toHaveBeenCalled();
    });

    it("rejects a stale compare-and-swap without overwriting the row", async () => {
      const update = vi.fn().mockReturnThis();
      const eq = vi.fn().mockReturnThis();
      const maybeSingle = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            settings: { pdkt: { selectedModel: "newer" } },
            updated_at: "2026-07-29T08:00:00.000Z",
          },
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null });
      const upsert = vi.fn();
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq,
        maybeSingle,
        update,
        upsert,
      });

      await expect(
        ketikService.saveSettings("user1", DEFAULT_KETIK_SETTINGS),
      ).rejects.toMatchObject({ code: "SETTINGS_CONFLICT", status: 409 });
      expect(upsert).not.toHaveBeenCalled();
    });

    it("fails closed when a concurrent insert wins the empty-row race", async () => {
      const insert = vi.fn().mockReturnThis();
      const maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: null });
      const single = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "23505", message: "duplicate key" },
      });
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
        insert,
        single,
      });

      await expect(
        ketikService.saveSettings("user1", DEFAULT_KETIK_SETTINGS),
      ).rejects.toMatchObject({ code: "SETTINGS_CONFLICT", status: 409 });
    });
  });
});

describe("KETIK Service - History", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  describe("getHistory", () => {
    it("returns empty array on error", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValue({ data: null, error: { message: "DB error" } }),
      });
      const history = await ketikService.getHistory("user1");
      expect(history).toEqual([]);
    });

    it("returns mapped history items", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: "sess1",
              date: "2025-01-15T10:00:00Z",
              scenario_title: "Pinjol Ilegal",
              consumer_name: "Budi",
              messages: [
                {
                  id: "m1",
                  sender: "agent",
                  text: "hello",
                  timestamp: "2025-01-15T10:00:00Z",
                },
              ],
              review_status: "completed",
              resolution_score: 78,
            },
          ],
          error: null,
        }),
      });
      const history = await ketikService.getHistory("user1");
      expect(history).toHaveLength(1);
      expect(history[0].scenarioTitle).toBe("Pinjol Ilegal");
      expect(history[0].reviewStatus).toBe("completed");
      expect(history[0].resolutionScore).toBe(78);
    });
  });

  describe("persistSession", () => {
    it("inserts session and returns mapped item", async () => {
      const mockInsertResult = {
        id: "new-sess-1",
        date: "2025-01-15T10:00:00Z",
        scenario_title: "Test Scenario",
        consumer_name: "Test Consumer",
        consumer_phone: "08123456789",
        consumer_city: "Jakarta",
        messages: [],
        simulation_duration: null,
        review_status: "pending",
      };
      mockFrom.mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: mockInsertResult, error: null }),
      });
      const result = await ketikService.persistSession("user1", {
        scenarioTitle: "Test Scenario",
        consumerName: "Test Consumer",
        consumerPhone: "08123456789",
        consumerCity: "Jakarta",
        messages: [],
      });
      expect(result.id).toBe("new-sess-1");
      expect(result.reviewStatus).toBe("pending");
    });

    it("passes simulation_duration to insert when provided", async () => {
      const mockInsert = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: "sess-dur-1",
          date: "2025-01-15T10:00:00Z",
          scenario_title: "Durasi Test",
          consumer_name: "Budi",
          consumer_phone: "",
          consumer_city: "",
          messages: [],
          simulation_duration: 10,
          review_status: "pending",
        },
        error: null,
      });
      mockFrom.mockReturnValue({
        insert: mockInsert,
        select: vi.fn().mockReturnThis(),
        single: mockSingle,
      });
      const result = await ketikService.persistSession("user1", {
        scenarioTitle: "Durasi Test",
        consumerName: "Budi",
        consumerPhone: "",
        consumerCity: "",
        messages: [],
        simulationDuration: 10,
      });
      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({ simulation_duration: 10 }),
      ]);
      expect(result.simulationDuration).toBe(10);
    });
  });

  describe("deleteSession", () => {
    it("deletes only for own user", async () => {
      const deleteQuery = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then")
              return (resolve: any) => resolve({ error: null });
            return () => deleteQuery;
          },
        },
      );
      mockFrom.mockReturnValue(deleteQuery);
      await expect(
        ketikService.deleteSession("sess1", "user1"),
      ).resolves.toBeUndefined();
    });
  });

  describe("clearHistory", () => {
    it("deletes all history for user", async () => {
      const deleteQuery = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then")
              return (resolve: any) => resolve({ error: null });
            return () => deleteQuery;
          },
        },
      );
      mockFrom.mockReturnValue(deleteQuery);
      await expect(ketikService.clearHistory("user1")).resolves.toBeUndefined();
    });
  });
});
