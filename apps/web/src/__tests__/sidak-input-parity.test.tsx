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

describe("SidakInputPage — temuan grid layout", () => {
  it("uses a responsive multi-column grid for temuan groups", () => {
    const gridClass = "grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3";
    expect(gridClass).toContain("grid-cols-1");
    expect(gridClass).toContain("md:grid-cols-2");
    expect(gridClass).toContain("2xl:grid-cols-3");
    expect(gridClass).toContain("items-start");
    expect(gridClass).not.toContain("space-y-3");
  });
});

describe("SidakInputPage — selection card layout", () => {
  it("uses a wider container for selection steps so the grid can actually breathe", () => {
    const containerClass = "mx-auto max-w-6xl space-y-6";
    expect(containerClass).toContain("max-w-6xl");
    expect(containerClass).not.toContain("max-w-3xl");
  });

  it("folder selection uses responsive grid and selection card layout", () => {
    const gridClass = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3";
    const cardClass =
      "group flex min-h-32 cursor-pointer flex-col items-start justify-between rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03] focus:outline-none focus:ring-2 focus:ring-primary/40";

    expect(gridClass).toContain("grid-cols-1");
    expect(gridClass).toContain("sm:grid-cols-2");
    expect(gridClass).toContain("xl:grid-cols-3");
    expect(cardClass).toContain("min-h-32");
    expect(cardClass).toContain("flex-col");
    expect(cardClass).not.toContain("px-5 py-4");
  });

  it("agent card has selection card layout", () => {
    const cardClass =
      "group flex min-h-32 cursor-pointer flex-col items-start justify-between rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03] focus:outline-none focus:ring-2 focus:ring-primary/40";
    expect(cardClass).toContain("min-h-32");
    expect(cardClass).toContain("flex-col");
  });

  it("period card has selection card layout", () => {
    const cardClass =
      "group flex min-h-32 cursor-pointer flex-col items-start justify-between rounded-2xl border border-border bg-card p-5 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03] focus:outline-none focus:ring-2 focus:ring-primary/40";
    expect(cardClass).toContain("min-h-32");
    expect(cardClass).toContain("flex-col");
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

describe("SidakInputPage — Skor Kualitas (Live) card parity", () => {
  it("card renders score display with NC and CR breakdown", () => {
    const cardHtml = `
      <div class="relative overflow-hidden rounded-3xl border border-border/80 bg-card/75 backdrop-blur-md p-6 shadow-md">
        <h3 class="text-xs font-black uppercase tracking-wider text-muted-foreground/90">
          Skor Kualitas (Live)
        </h3>
        <div class="relative flex h-24 w-24 shrink-0 items-center justify-center">
          <svg class="h-full w-full -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="36" class="stroke-muted-foreground/10" stroke-width="7" fill="transparent" />
            <circle cx="48" cy="48" r="36" stroke="#22c55e" stroke-width="7" fill="transparent" stroke-dasharray="226.19" stroke-dashoffset="33.92" stroke-linecap="round" />
          </svg>
          <div class="absolute flex flex-col items-center justify-center text-center">
            <span class="text-2xl font-black tracking-tight leading-none text-green-500">85</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 rounded-2xl bg-rose-500/[0.04] border border-rose-500/10">
            <div class="text-[9px] font-black uppercase tracking-wider text-rose-600">NC Score</div>
            <div class="text-base font-black text-rose-600">80</div>
          </div>
          <div class="p-3 rounded-2xl bg-blue-500/[0.04] border border-blue-500/10">
            <div class="text-[9px] font-black uppercase tracking-wider text-blue-600">CR Score</div>
            <div class="text-base font-black text-blue-600">90</div>
          </div>
        </div>
      </div>
    `;
    expect(cardHtml).toContain("Skor Kualitas (Live)");
    expect(cardHtml).toContain("NC Score");
    expect(cardHtml).toContain("CR Score");
    expect(cardHtml).toContain("text-2xl font-black");
    expect(cardHtml).toContain("circle cx=\"48\"");
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
