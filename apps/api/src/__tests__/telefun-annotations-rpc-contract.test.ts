import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createReplayAnnotationChecksum } from "../routes/telefun/annotations";

// 1. Setup Hoisted mocks
const { mockFrom, mockCreateAdminClient, mockRpc, mockGenerateGeminiContent } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockGenerateGeminiContent: vi.fn(),
  mockCreateAdminClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
    storage: {
      from: vi.fn(() => ({
        download: vi.fn().mockResolvedValue({
          data: {
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
          },
          error: null,
        }),
      })),
    },
  })),
}));

// Mock Supabase
vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
  },
  createAdminClient: mockCreateAdminClient,
}));

// Mock Gemini
vi.mock("../lib/gemini", () => ({
  generateGeminiContent: mockGenerateGeminiContent,
}));

import { telefunAnnotations } from "../routes/telefun/annotations";

function buildApp() {
  const app = new Hono<{ Variables: { user: any; profile: any } }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" });
    c.set("profile", { role: "trainer" });
    await next();
  });
  app.route("/", telefunAnnotations);
  return app;
}

describe("Telefun Annotations RPC Contract & Checksum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockCreateAdminClient.mockReturnValue({
      from: mockFrom,
      rpc: mockRpc,
      storage: {
        from: vi.fn(() => ({
          download: vi.fn().mockResolvedValue({
            data: {
              arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
            },
            error: null,
          }),
        })),
      },
    } as any);
  });

  describe("createReplayAnnotationChecksum helper", () => {
    it("should produce a valid 64-character lowercase SHA-256 hex regex matches", () => {
      const annotations = [
        {
          timestamp_ms: 1000,
          category: "strength",
          moment: "good_de_escalation",
          text: "Pelanggan dilayani dengan ramah",
          is_manual: false,
        },
      ];
      const checksum = createReplayAnnotationChecksum(annotations);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should be deterministic regardless of annotation order", () => {
      const ann1 = {
        timestamp_ms: 1000,
        category: "strength",
        moment: "good_de_escalation",
        text: "Pelanggan dilayani dengan ramah",
        is_manual: false,
      };
      const ann2 = {
        timestamp_ms: 2000,
        category: "improvement_area",
        moment: "missed_empathy",
        text: "Agen melupakan empati",
        is_manual: false,
      };

      const checksumA = createReplayAnnotationChecksum([ann1, ann2]);
      const checksumB = createReplayAnnotationChecksum([ann2, ann1]);
      expect(checksumA).toBe(checksumB);
    });

    it("ignores manual annotations", () => {
      const ann1 = {
        timestamp_ms: 1000,
        category: "strength",
        moment: "good_de_escalation",
        text: "Pelanggan dilayani dengan ramah",
        is_manual: false,
      };
      const annManual = {
        timestamp_ms: 2000,
        category: "improvement_area",
        moment: "missed_empathy",
        text: "Anotasi manual",
        is_manual: true,
      };

      const checksumOnlyAI = createReplayAnnotationChecksum([ann1]);
      const checksumWithManual = createReplayAnnotationChecksum([ann1, annManual]);
      expect(checksumOnlyAI).toBe(checksumWithManual);
    });

    it("hashes using truncated text at 500 characters limit", () => {
      const truncatedText = "a".repeat(500);

      const annTruncated = {
        timestamp_ms: 1000,
        category: "strength",
        moment: "good_de_escalation",
        text: truncatedText,
        is_manual: false,
      };

      const checksumTruncated = createReplayAnnotationChecksum([annTruncated]);
      expect(checksumTruncated).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("API Endpoint POST /annotations/generate/:id", () => {
    it("hashes the normalized rows that are persisted", async () => {
      const app = buildApp();
      const insert = vi.fn().mockReturnThis();
      const select = vi.fn().mockResolvedValue({
        data: [{ id: "ann-1" }],
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "telefun_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "sess-1",
                user_id: "user-1",
                agent_recording_path: "user-1/sess-1/agent_only.webm",
              },
              error: null,
            }),
          };
        }
        if (table === "telefun_replay_annotations") {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            insert,
            select,
          };
        }
        return {};
      });

      mockGenerateGeminiContent.mockResolvedValue({
        text: JSON.stringify({
          annotations: [
            {
              timestamp_ms: 1000,
              category: "strength",
              moment: "",
              text: "a".repeat(1000),
            },
          ],
          recommendations: [],
        }),
      });
      mockRpc.mockResolvedValue({ data: null, error: null });

      const res = await app.request("/annotations/generate/sess-1", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const persistedRows = insert.mock.calls[0][0];
      expect(persistedRows[0]).toMatchObject({
        moment: "",
        text: "a".repeat(500),
      });

      expect(mockRpc.mock.calls[0][1].p_ai_annotation_checksum).toBe(
        createReplayAnnotationChecksum(persistedRows),
      );
    });

    it("should call RPC with exactly 4 arguments and not contain p_user_id", async () => {
      const app = buildApp();

      // Mock session retrieval
      mockFrom.mockImplementation((table: string) => {
        if (table === "telefun_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "sess-1",
                user_id: "user-1",
                agent_recording_path: "user-1/sess-1/agent_only.webm",
                scenario_title: "Scenario test",
                consumer_name: "John Doe",
              },
              error: null,
            }),
          };
        }
        if (table === "telefun_replay_annotations") {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({
              data: [{ id: "ann-1" }],
              error: null,
            }),
          };
        }
        return {};
      });

      // Mock Gemini response
      mockGenerateGeminiContent.mockResolvedValue({
        text: JSON.stringify({
          annotations: [
            {
              timestamp_ms: 1000,
              category: "strength",
              moment: "good_de_escalation",
              text: "Good communication",
            },
          ],
          recommendations: [
            {
              text: "Keep it up",
              priority: 3,
            },
          ],
        }),
      });

      // Mock RPC success
      mockRpc.mockResolvedValue({ data: null, error: null });

      const res = await app.request("/annotations/generate/sess-1", {
        method: "POST",
      });

      expect(res.status).toBe(200);

      // Verify RPC calls
      expect(mockRpc).toHaveBeenCalledTimes(1);
      const rpcArgs = mockRpc.mock.calls[0];
      expect(rpcArgs[0]).toBe("upsert_telefun_coaching_summary");
      
      const payload = rpcArgs[1];
      expect(payload).toHaveProperty("p_session_id");
      expect(payload).toHaveProperty("p_recommendations");
      expect(payload).toHaveProperty("p_ai_annotation_count");
      expect(payload).toHaveProperty("p_ai_annotation_checksum");
      expect(payload).not.toHaveProperty("p_user_id");

      // Count the number of keys to ensure exactly 4
      const keys = Object.keys(payload);
      expect(keys.length).toBe(4);
    });

    it("returns 500 when RPC upsert coaching summary fails", async () => {
      const app = buildApp();

      mockFrom.mockImplementation((table: string) => {
        if (table === "telefun_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "sess-1",
                user_id: "user-1",
                agent_recording_path: "user-1/sess-1/agent_only.webm",
              },
              error: null,
            }),
          };
        }
        if (table === "telefun_replay_annotations") {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({
              data: [{ id: "ann-1" }],
              error: null,
            }),
          };
        }
        return {};
      });

      mockGenerateGeminiContent.mockResolvedValue({
        text: JSON.stringify({
          annotations: [
            {
              timestamp_ms: 1000,
              category: "strength",
              moment: "good_de_escalation",
              text: "Good communication",
            },
          ],
          recommendations: [],
        }),
      });

      // Mock RPC error
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "Database constraint error upsert coaching summary" },
      });

      const res = await app.request("/annotations/generate/sess-1", {
        method: "POST",
      });

      expect(res.status).toBe(500);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("Gagal menyimpan coaching summary");
    });
  });
});
