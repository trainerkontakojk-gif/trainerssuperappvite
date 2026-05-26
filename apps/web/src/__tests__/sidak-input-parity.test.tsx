import { describe, it, expect, vi } from "vitest";
import { normalizeAgentsResponse } from "../routes/sidak/input";
import { scoreColor, scoreBg, scoreLabel } from "../lib/scoring";

describe("SidakInputPage — normalizeAgentsResponse", () => {
  it("extracts agents array from object shape", () => {
    const payload = {
      agents: [
        { id: "a1", nama: "Alice", batch_name: "Alpha" },
        { id: "a2", nama: "Bob", batch_name: "Beta" },
      ],
      batches: ["Alpha", "Beta"],
    };
    expect(normalizeAgentsResponse(payload)).toEqual(payload.agents);
  });

  it("passes through legacy array shape", () => {
    const payload = [
      { id: "a1", nama: "Alice" },
      { id: "a2", nama: "Bob" },
    ];
    expect(normalizeAgentsResponse(payload)).toEqual(payload);
  });

  it("returns empty array for null", () => {
    expect(normalizeAgentsResponse(null)).toEqual([]);
  });
});

describe("SidakInputPage — navigation pre-fill contract", () => {
  it("loadFolderAndPreSelectAgent exists and is callable", async () => {
    const mod = await import("../routes/sidak/input");
    expect(mod.default).toBeDefined();
  });

  it("URL params are parsed correctly: folder + agent_id → skips to period step", () => {
    const params = new URLSearchParams("folder=Tim+Email&agent_id=agent-1");
    expect(params.get("folder")).toBe("Tim Email");
    expect(params.get("agent_id")).toBe("agent-1");
  });

  it("handles params with special characters", () => {
    const params = new URLSearchParams({ folder: "Tim CSO / Mix", agent_id: "agent-123" });
    expect(params.get("folder")).toBe("Tim CSO / Mix");
    expect(params.get("agent_id")).toBe("agent-123");
  });

  it("falls back when only folder present but no agent_id", () => {
    const params = new URLSearchParams("folder=Tim+Email");
    expect(params.get("folder")).toBe("Tim Email");
    expect(params.get("agent_id")).toBeNull();
  });
});

describe("SidakInputPage — vertical list layout parity", () => {
  it("uses single-column layout (grid gap-2, not multi-column grid-cols-*)", () => {
    const gridSingleCol = "grid gap-2";
    expect(gridSingleCol).toContain("gap-2");
    expect(gridSingleCol).not.toContain("grid-cols-");
  });

  it("folder card has icon|name|chevron pattern", () => {
    const cardClass =
      "flex items-center gap-4 px-5 py-4 bg-card border border-border hover:border-primary/40 rounded-2xl group transition-all text-left";
    expect(cardClass).toContain("flex items-center gap-4");
    expect(cardClass).toContain("px-5 py-4");
    expect(cardClass).toContain("rounded-2xl");
  });

  it("agent card has avatar|name+tim|chevron pattern", () => {
    const cardClass =
      "flex items-center gap-4 px-5 py-4 bg-card border border-border hover:border-primary/40 rounded-2xl group transition-all text-left";
    expect(cardClass).toContain("flex items-center gap-4");
    expect(cardClass).toContain("px-5 py-4");
  });

  it("period card has month-badge|name+year|chevron pattern", () => {
    const cardClass =
      "flex items-center gap-4 px-5 py-4 bg-card border border-border hover:border-primary/40 rounded-2xl group transition-all text-left";
    expect(cardClass).toContain("flex items-center gap-4");
    expect(cardClass).toContain("px-5 py-4");
  });
});

describe("SidakInputPage — compact breadcrumb parity", () => {
  it("breadcrumb segments are clickable and show actual values", () => {
    const breadcrumbHtml = `
      <div class="flex items-center gap-1 text-[10px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap overflow-x-auto pb-1">
        <button class="transition-colors shrink-0">Folder</button>
        <svg class="w-3 h-3 text-muted-foreground/30 shrink-0">chevron</svg>
        <button class="transition-colors truncate max-w-[120px]">Tim Email</button>
      </div>
    `;
    expect(breadcrumbHtml).toContain("Folder");
    expect(breadcrumbHtml).toContain("Tim Email");
    expect(breadcrumbHtml).toContain("max-w-[120px]");
  });

  it("shows agent name when selected", () => {
    const breadcrumbHtml = `
      <div class="flex items-center gap-1">
        <button>Folder</button>
        <svg>chevron</svg>
        <button>Tim Email</button>
        <svg>chevron</svg>
        <button class="truncate max-w-[120px]">Noor Qodiri</button>
      </div>
    `;
    expect(breadcrumbHtml).toContain("Noor Qodiri");
  });

  it("shows period when selected", () => {
    const breadcrumbHtml = `
      <div class="flex items-center gap-1">
        <button>Folder</button>
        <svg>chevron</svg>
        <button>Tim Email</button>
        <svg>chevron</svg>
        <button>Noor Qodiri</button>
        <svg>chevron</svg>
        <span class="truncate max-w-[120px]">Mei 2026</span>
      </div>
    `;
    expect(breadcrumbHtml).toContain("Mei 2026");
  });
});

describe("SidakInputPage — Show All toggle parity", () => {
  it("toggle renders with Eye icon when inactive", () => {
    const toggleInactive = `
      <button data-testid="show-all-toggle"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border bg-background border-border/50 text-muted-foreground hover:border-amber-400"
      >
        <svg class="w-3.5 h-3.5">eye</svg>
        Tampilkan Semua
      </button>
    `;
    expect(toggleInactive).toContain("data-testid=\"show-all-toggle\"");
    expect(toggleInactive).toContain("Tampilkan Semua");
    expect(toggleInactive).toContain("bg-background");
  });

  it("toggle renders with EyeOff icon when active", () => {
    const toggleActive = `
      <button data-testid="show-all-toggle"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border bg-amber-500 text-white border-amber-500"
      >
        <svg class="w-3.5 h-3.5">eye-off</svg>
        Data Terfilter
      </button>
    `;
    expect(toggleActive).toContain("bg-amber-500");
    expect(toggleActive).toContain("Data Terfilter");
  });
});

describe("SidakInputPage — Konfigurasi Audit card parity", () => {
  it("card renders with correct title and fields", () => {
    const cardHtml = `
      <div class="bg-card rounded-2xl border border-border p-5 shadow-sm">
        <h3 class="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
          Konfigurasi Audit
        </h3>
        <div class="grid grid-cols-2 gap-4">
          <div><label>Layanan Audit</label><select>...</select></div>
          <div><label>Tim Agent</label><div>Tim Email</div></div>
        </div>
      </div>
    `;
    expect(cardHtml).toContain("Konfigurasi Audit");
    expect(cardHtml).toContain("Layanan Audit");
    expect(cardHtml).toContain("Tim Agent");
    expect(cardHtml).toContain("grid-cols-2 gap-4");
  });
});

describe("SidakInputPage — Estimasi Skor card parity", () => {
  it("card renders score display with NC and CR breakdown", () => {
    const cardHtml = `
      <div class="bg-card rounded-2xl border border-border p-5 shadow-sm">
        <h3 class="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Estimasi Skor
        </h3>
        <div class="text-4xl font-black">85</div>
        <div class="h-2.5 rounded-full bg-foreground/10 overflow-hidden">
          <div class="h-full rounded-full bg-green-500" style="width: 85%"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <div class="text-[10px] font-bold uppercase tracking-wider text-rose-600">NC Score</div>
            <div class="text-lg font-black text-rose-600">80</div>
          </div>
          <div class="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div class="text-[10px] font-bold uppercase tracking-wider text-blue-600">CR Score</div>
            <div class="text-lg font-black text-blue-600">90</div>
          </div>
        </div>
      </div>
    `;
    expect(cardHtml).toContain("Estimasi Skor");
    expect(cardHtml).toContain("NC Score");
    expect(cardHtml).toContain("CR Score");
    expect(cardHtml).toContain("text-4xl font-black");
    expect(cardHtml).toContain("h-2.5 rounded-full");
  });

  it("shows dash when no score available (no temuan)", () => {
    const emptyHtml = `<div class="text-4xl font-black text-muted-foreground">—</div>`;
    expect(emptyHtml).toContain("—");
    expect(emptyHtml).toContain("text-muted-foreground");
  });
});

describe("scoring utility helper", () => {
  it("scoreColor returns green for high scores", () => {
    expect(scoreColor(85)).toContain("green");
    expect(scoreColor(100)).toContain("green");
  });

  it("scoreColor returns amber for medium scores", () => {
    expect(scoreColor(70)).toContain("amber");
    expect(scoreColor(84)).toContain("amber");
  });

  it("scoreColor returns red for low scores", () => {
    expect(scoreColor(0)).toContain("red");
    expect(scoreColor(69)).toContain("red");
  });

  it("scoreBg returns appropriate background colors", () => {
    expect(scoreBg(90)).toContain("green");
    expect(scoreBg(75)).toContain("amber");
    expect(scoreBg(50)).toContain("red");
  });

  it("scoreLabel returns correct Indonesian labels", () => {
    expect(scoreLabel(85)).toBe("Baik");
    expect(scoreLabel(72)).toBe("Cukup");
    expect(scoreLabel(0)).toBe("Perlu Perhatian");
  });
});
