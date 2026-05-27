import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: vi.fn().mockResolvedValue({
    success: true,
    text: JSON.stringify({
      summary: "Test summary",
      strengths: ["Good"],
      weaknesses: ["Needs improvement"],
      coachingFocus: ["Focus on probing"],
      scores: { final: 85, empathy: 90, probing: 80, typo: 85, compliance: 85 },
      typos: [],
    }),
  }),
}));

vi.mock("../lib/openrouter", () => ({
  generateOpenRouterContent: vi.fn().mockResolvedValue({
    success: false,
    error: "Fallback not needed",
  }),
}));

import * as ketikService from "../services/ketik-service";

describe("KETIK Review Route Lifecycle", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  describe("triggerKetikAIReview", () => {
    it("marks history as failed when job upsert fails after session found", async () => {
      let historyMarkedFailed = false;

      mockFrom.mockImplementation((table: string) => {
        if (table === "ketik_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: "sess1", user_id: "user1", review_status: "pending", messages: [] },
              error: null,
            }),
            update: vi.fn().mockImplementation((data: any) => {
              if (data?.review_status === "failed") historyMarkedFailed = true;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        if (table === "ketik_review_jobs") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: new Error("DB constraint violation") }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
        };
      });

      await expect(
        ketikService.triggerKetikAIReview("sess1", "user1"),
      ).rejects.toThrow("DB constraint violation");

      expect(historyMarkedFailed).toBe(true);
    });
  });

  describe("getKetikReviewStatus", () => {
    it("marks stale processing with expired lease as failed", async () => {
      const pastLeaseDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      let historyMarkedFailed = false;
      let jobMarkedFailed = false;

      mockFrom.mockImplementation((table: string) => {
        if (table === "ketik_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                review_status: "processing",
                final_score: null,
                empathy_score: null,
                probing_score: null,
                typo_score: null,
                compliance_score: null,
              },
              error: null,
            }),
            update: vi.fn().mockImplementation((data: any) => {
              if (data?.review_status === "failed") historyMarkedFailed = true;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        if (table === "ketik_review_jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                status: "processing",
                lease_expires_at: pastLeaseDate,
                error_message: null,
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
            update: vi.fn().mockImplementation((data: any) => {
              if (data?.status === "failed") jobMarkedFailed = true;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
          };
        }
        if (table === "ketik_session_reviews") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue(null),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
        };
      });

      const result = await ketikService.getKetikReviewStatus("sess1", "user1");

      expect(result.status).toBe("failed");
      expect(historyMarkedFailed).toBe(true);
      expect(jobMarkedFailed).toBe(true);
    });

    it("returns processing for active lease (not expired)", async () => {
      const futureLeaseDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      mockFrom.mockImplementation((table: string) => {
        if (table === "ketik_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                review_status: "processing",
                final_score: null,
                empathy_score: null,
                probing_score: null,
                typo_score: null,
                compliance_score: null,
              },
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
          };
        }
        if (table === "ketik_review_jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                status: "processing",
                lease_expires_at: futureLeaseDate,
                error_message: null,
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
          };
        }
        if (table === "ketik_session_reviews") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue(null),
          };
        }
        return {};
      });

      const result = await ketikService.getKetikReviewStatus("sess1", "user1");
      expect(result.status).toBe("processing");
    });
  });
});
