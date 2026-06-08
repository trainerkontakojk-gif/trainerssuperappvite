import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TelefunTranscript } from "../routes/telefun/components/TelefunTranscript";
import {
  formatTranscriptTimestamp,
  getTranscriptSpeakerLabel,
} from "../routes/telefun/components/telefunTranscriptFormatters";

describe("formatTranscriptTimestamp", () => {
  it("converts 3000ms to 00:03", () => {
    expect(formatTranscriptTimestamp(3000)).toBe("00:03");
  });

  it("converts 65000ms to 01:05", () => {
    expect(formatTranscriptTimestamp(65000)).toBe("01:05");
  });

  it("uses h:mm:ss for durations over an hour", () => {
    expect(formatTranscriptTimestamp(3661000)).toBe("1:01:01");
  });

  it("handles 0ms", () => {
    expect(formatTranscriptTimestamp(0)).toBe("00:00");
  });
});

describe("getTranscriptSpeakerLabel", () => {
  it("returns User/Agent for agent", () => {
    expect(getTranscriptSpeakerLabel("agent")).toBe("User/Agent");
  });

  it("returns Konsumen for consumer", () => {
    expect(getTranscriptSpeakerLabel("consumer")).toBe("Konsumen");
  });
});

describe("TelefunTranscript component", () => {
  it("renders structured entries over legacy text", () => {
    render(
      <TelefunTranscript
        entries={[
          { speaker: "agent", text: "Halo", startMs: 3000 },
          { speaker: "consumer", text: "Halo juga", startMs: 5000 },
        ]}
        legacyText="Old transcript"
      />,
    );
    expect(screen.getByText("Halo")).toBeDefined();
    expect(screen.getByText("Halo juga")).toBeDefined();
    expect(screen.getByText("(User/Agent)")).toBeDefined();
    expect(screen.getByText("(Konsumen)")).toBeDefined();
    expect(screen.getByText("00:03:")).toBeDefined();
    expect(screen.getByText("00:05:")).toBeDefined();
    expect(screen.queryByText("Old transcript")).toBeNull();
  });

  it("renders legacy fallback when no entries", () => {
    render(
      <TelefunTranscript
        entries={[]}
        legacyText="Legacy paragraph transcript"
      />,
    );
    expect(screen.getByText("Legacy paragraph transcript")).toBeDefined();
  });

  it("renders empty state when both are empty", () => {
    render(<TelefunTranscript entries={[]} legacyText="" />);
    expect(
      screen.getByText("Transcript belum tersedia untuk sesi ini."),
    ).toBeDefined();
  });

  it("renders empty state when both are null", () => {
    render(<TelefunTranscript entries={null} legacyText={null} />);
    expect(
      screen.getByText("Transcript belum tersedia untuk sesi ini."),
    ).toBeDefined();
  });

  it("uses semantic ordered list for structured entries", () => {
    const { container } = render(
      <TelefunTranscript
        entries={[{ speaker: "agent", text: "Test", startMs: 1000 }]}
      />,
    );
    expect(container.querySelector("ol")).toBeDefined();
    expect(container.querySelector("time")).toBeDefined();
  });
});
