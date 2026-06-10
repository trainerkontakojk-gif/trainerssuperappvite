import { describe, expect, it } from "vitest";
import { TranscriptCollector } from "./transcript.js";

const STARTED_AT = 1000;

function collector(): TranscriptCollector {
  return new TranscriptCollector(STARTED_AT);
}

describe("TranscriptCollector", () => {
  it("stores first chunk with relative timestamp", () => {
    const c = collector();
    c.append({ speaker: "agent", text: "Halo", observedAtMs: 4000 });
    c.flush(5000);
    const s = c.snapshot();
    expect(s).toHaveLength(1);
    expect(s[0].speaker).toBe("agent");
    expect(s[0].text).toBe("Halo");
    expect(s[0].startMs).toBe(3000);
  });

  it("merges same-speaker chunks into one utterance", () => {
    const c = collector();
    c.append({ speaker: "consumer", text: "Selamat", observedAtMs: 3000 });
    c.append({ speaker: "consumer", text: " pagi", observedAtMs: 3500 });
    c.flush(5000);
    const s = c.snapshot();
    expect(s).toHaveLength(1);
    expect(s[0].text).toBe("Selamat pagi");
    expect(s[0].startMs).toBe(2000);
  });

  it("preserves streaming fragment boundaries without injecting spaces", () => {
    const c = collector();
    c.append({ speaker: "consumer", text: "Ca", observedAtMs: 3000 });
    c.append({ speaker: "consumer", text: "n I", observedAtMs: 3200 });
    c.append({ speaker: "consumer", text: " help", observedAtMs: 3400 });
    c.flush(5000);

    expect(c.snapshot()[0].text).toBe("Can I help");
  });

  it("replaces a shorter partial with its cumulative expansion", () => {
    const c = collector();
    c.append({ speaker: "agent", text: "Selamat", observedAtMs: 3000 });
    c.append({
      speaker: "agent",
      text: "Selamat pagi",
      observedAtMs: 3200,
    });
    c.flush(5000);

    expect(c.snapshot()[0].text).toBe("Selamat pagi");
  });

  it("does not duplicate when partial chunk is a prefix of inner chunk", () => {
    const c = collector();
    c.append({ speaker: "agent", text: "Saya ingin", observedAtMs: 5000 });
    c.append({ speaker: "agent", text: "Saya", observedAtMs: 5200 });
    c.flush(6000);
    const s = c.snapshot();
    expect(s).toHaveLength(1);
    expect(s[0].text).toBe("Saya ingin");
  });

  it("flushes on speaker switch", () => {
    const c = collector();
    c.append({ speaker: "agent", text: "Halo", observedAtMs: 3000 });
    c.append({ speaker: "consumer", text: "Halo juga", observedAtMs: 5000 });
    c.flush(6000);
    const s = c.snapshot();
    expect(s).toHaveLength(2);
    expect(s[0].speaker).toBe("agent");
    expect(s[0].startMs).toBe(2000);
    expect(s[1].speaker).toBe("consumer");
    expect(s[1].startMs).toBe(4000);
  });

  it("flushes on turn complete", () => {
    const c = collector();
    c.append({ speaker: "consumer", text: "Ada yang bisa dibantu", observedAtMs: 3000 });
    c.completeTurn("consumer");
    const s = c.snapshot();
    expect(s).toHaveLength(1);
    expect(s[0].text).toBe("Ada yang bisa dibantu");
  });

  it("ignores empty or whitespace chunks", () => {
    const c = collector();
    c.append({ speaker: "agent", text: "", observedAtMs: 3000 });
    c.append({ speaker: "agent", text: "   ", observedAtMs: 4000 });
    c.flush(5000);
    expect(c.snapshot()).toHaveLength(0);
  });

  it("preserves previous entries after reconnect (no reset)", () => {
    const c = collector();
    c.append({ speaker: "agent", text: "Halo", observedAtMs: 3000 });
    c.flush(4000);
    c.append({ speaker: "consumer", text: "Halo juga", observedAtMs: 5000 });
    c.flush(6000);
    const s = c.snapshot();
    expect(s).toHaveLength(2);
  });

  it("flush before disconnect captures active utterance", () => {
    const c = collector();
    c.append({ speaker: "agent", text: "Terima kasih", observedAtMs: 5000 });
    c.flush(6000);
    const s = c.snapshot();
    expect(s).toHaveLength(1);
    expect(s[0].text).toBe("Terima kasih");
  });

  it("snapshot returns a copy", () => {
    const c = collector();
    c.append({ speaker: "agent", text: "Test", observedAtMs: 3000 });
    c.flush(4000);
    const s = c.snapshot();
    s.length = 0;
    expect(c.snapshot()).toHaveLength(1);
  });

  // === New tests: logical turn ordering with per-speaker lanes ===

  it("output-before-input: orders agent first then consumer per logical turn", () => {
    const c = collector();
    c.append({ speaker: "consumer", text: "Konsumen duluan", observedAtMs: 4000 });
    c.append({ speaker: "agent", text: "Agent kemudian", observedAtMs: 3000 });
    c.completeTurn("consumer");
    const s = c.snapshot();
    expect(s).toHaveLength(2);
    expect(s[0].speaker).toBe("agent");
    expect(s[0].text).toBe("Agent kemudian");
    expect(s[1].speaker).toBe("consumer");
    expect(s[1].text).toBe("Konsumen duluan");
  });

  it("lane independen: fragments merge per-speaker without cross-flush", () => {
    const c = collector();
    c.append({ speaker: "agent", text: "Hal", observedAtMs: 3000 });
    c.append({ speaker: "consumer", text: "Ya", observedAtMs: 4000 });
    c.append({ speaker: "agent", text: "o", observedAtMs: 3500 });
    c.append({ speaker: "consumer", text: ", silakan", observedAtMs: 4500 });
    c.flush(5000);
    const s = c.snapshot();
    expect(s).toHaveLength(2);
    expect(s[0].speaker).toBe("agent");
    expect(s[0].text).toBe("Halo");
    expect(s[1].speaker).toBe("consumer");
    expect(s[1].text).toBe("Ya, silakan");
  });

  it("timestamp monoton: lane timestamp tidak berubah akibat event speaker lain", () => {
    const c = collector();
    c.append({ speaker: "consumer", text: "Konsumen duluan", observedAtMs: 6000 });
    c.append({ speaker: "agent", text: "Agent kemudian", observedAtMs: 3000 });
    c.completeTurn("consumer");
    const s = c.snapshot();
    expect(s[0].speaker).toBe("agent");
    expect(s[0].text).toBe("Agent kemudian");
    expect(s[0].startMs).toBe(2000);
    expect(s[1].speaker).toBe("consumer");
    expect(s[1].text).toBe("Konsumen duluan");
    expect(s[1].startMs).toBe(5000);
  });

  it("clamps timestamps when logical speaker order differs from arrival timestamps", () => {
    const c = collector();
    c.append({ speaker: "consumer", text: "Lebih dulu tiba", observedAtMs: 3000 });
    c.append({ speaker: "agent", text: "Urutan logis pertama", observedAtMs: 6000 });
    c.completeTurn("consumer");

    const s = c.snapshot();
    expect(s.map((entry) => entry.speaker)).toEqual(["agent", "consumer"]);
    expect(s.map((entry) => entry.startMs)).toEqual([5000, 5000]);
  });

  it("interrupted/barge-in: tidak mencampur utterance ke turn sebelumnya", () => {
    const c = collector();
    c.append({ speaker: "agent", text: "Halo, ada yang", observedAtMs: 3000 });
    c.append({ speaker: "consumer", text: "Ya silakan", observedAtMs: 5000 });
    c.completeTurn("consumer");
    c.append({ speaker: "agent", text: "bisa saya bantu", observedAtMs: 7000 });
    c.flush(8000);
    const s = c.snapshot();
    expect(s).toHaveLength(3);
    expect(s[0].text).toBe("Halo, ada yang");
    expect(s[0].speaker).toBe("agent");
    expect(s[1].text).toBe("Ya silakan");
    expect(s[1].speaker).toBe("consumer");
    expect(s[2].text).toBe("bisa saya bantu");
    expect(s[2].speaker).toBe("agent");
    expect(s[2].startMs).toBe(6000);
  });

  it("keeps post-interruption fragments in a new logical turn", () => {
    const c = collector();
    c.append({
      speaker: "consumer",
      text: "Jawaban sebelum terpotong",
      observedAtMs: 3000,
    });

    c.interruptTurn();

    c.append({
      speaker: "agent",
      text: "Maaf saya potong",
      observedAtMs: 5000,
    });
    c.append({
      speaker: "consumer",
      text: "Baik, silakan",
      observedAtMs: 7000,
    });
    c.completeTurn();

    expect(c.snapshot().map(({ speaker, text }) => ({ speaker, text }))).toEqual([
      { speaker: "consumer", text: "Jawaban sebelum terpotong" },
      { speaker: "agent", text: "Maaf saya potong" },
      { speaker: "consumer", text: "Baik, silakan" },
    ]);
  });
});
