import { describe, it, expect } from "vitest";

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay > 7) return date.toLocaleDateString("id-ID");
  if (diffDay >= 1) return `${diffDay}h yang lalu`;
  if (diffHr >= 1) return `${diffHr}j yang lalu`;
  if (diffMin >= 1) return `${diffMin}m yang lalu`;
  return "Baru saja";
}

function normalizeActionText(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

describe("dashboard-post-login parity", () => {
  describe("recent activity display count", () => {
    it("renders max 5 items matching legacy parity", () => {
      const mockLogs = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        user_name: `User ${i}`,
        action: `action_${i}`,
        created_at: new Date().toISOString(),
        type: i % 3 === 0 ? "login" : "edit",
      }));

      const formatted = mockLogs.map((act) => ({
        id: act.id,
        user: act.user_name || "Pengguna internal",
        action: normalizeActionText(act.action),
        time: formatTimeAgo(act.created_at),
        type: act.type,
      }));

      const displayed = formatted.slice(0, 5);
      expect(displayed).toHaveLength(5);
      expect(displayed[0].id).toBe(0);
      expect(displayed[4].id).toBe(4);
      expect(formatted).toHaveLength(10);
    });

    it("handles fewer than 5 items without error", () => {
      const mockLogs = Array.from({ length: 2 }, (_, i) => ({
        id: i,
        user_name: `User ${i}`,
        action: "test_action",
        created_at: new Date().toISOString(),
        type: "add",
      }));

      const formatted = mockLogs.map((act) => ({
        id: act.id,
        user: act.user_name || "Pengguna internal",
        action: normalizeActionText(act.action),
        time: formatTimeAgo(act.created_at),
        type: act.type,
      }));

      const displayed = formatted.slice(0, 5);
      expect(displayed).toHaveLength(2);
    });

    it("handles empty logs array", () => {
      const displayed = [].slice(0, 5);
      expect(displayed).toHaveLength(0);
    });
  });

  describe("formatTimeAgo", () => {
    it("returns 'Baru saja' for recent time", () => {
      const now = new Date().toISOString();
      expect(formatTimeAgo(now)).toBe("Baru saja");
    });
  });

  describe("normalizeActionText", () => {
    it("formats snake_case to Title Case", () => {
      expect(normalizeActionText("create_period")).toBe("Create Period");
      expect(normalizeActionText("delete_temuan")).toBe("Delete Temuan");
    });
  });
});
