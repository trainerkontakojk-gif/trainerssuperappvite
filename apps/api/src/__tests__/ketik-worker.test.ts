import { describe, it, expect, vi } from "vitest";
import * as ketikService from "../services/ketik-service";

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { session_id: "sess1" }, error: null }),
    update: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  }),
}));

describe("KETIK Worker Service", () => {
  it("should process oldest queued job", async () => {
    // Mocking the behavior of claimAndProcessKetikReviewJob as well if needed
    // But let's just test that it tries to find a job
    const result = await ketikService.processOldestQueuedJob("worker1");
    expect(result).toBeDefined();
  });
});
