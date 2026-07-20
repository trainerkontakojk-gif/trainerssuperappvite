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
      expect(settings.selectedModel).toBe("gemini-3.1-flash-lite");
      expect(settings.simulationDuration).toBe(5);
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
      expect(settings.selectedModel).toBe("openai/gpt-4o-mini");
      expect(settings.simulationDuration).toBe(10);
      expect(settings.responsePacingMode).toBe("training_fast");
    });
  });

  describe("saveSettings", () => {
    it("saves settings for own user", async () => {
      let upsertCalled = false;
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockImplementation((data) => {
          upsertCalled = true;
          expect(data.user_id).toBe("user1");
          expect(data.settings.ketik.scenarios).toBeDefined();
          return { error: null };
        }),
      });
      await expect(
        ketikService.saveSettings("user1", DEFAULT_KETIK_SETTINGS),
      ).resolves.toBeUndefined();
      expect(upsertCalled).toBe(true);
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
