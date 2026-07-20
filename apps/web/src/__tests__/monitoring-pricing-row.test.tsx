import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PricingRow } from "../routes/monitoring/components/PricingRow";
import {
  buildPricingUpdatePayload,
  type PricingEntry,
} from "../routes/monitoring/components/PricingTab";

function entry(overrides: Partial<PricingEntry> = {}): PricingEntry {
  return {
    model_id: "gemini-3.1-flash-lite",
    model_name: "Gemini Flash Lite",
    provider: "gemini",
    pricing_mode: "simple",
    input_price_usd_per_million: 1,
    output_price_usd_per_million: 2,
    input_text_price_usd_per_million: null,
    cached_input_text_price_usd_per_million: null,
    input_audio_price_usd_per_million: null,
    cached_input_audio_price_usd_per_million: null,
    output_text_price_usd_per_million: null,
    output_audio_price_usd_per_million: null,
    ...overrides,
  };
}

function renderRow(value: PricingEntry, onSave = vi.fn()) {
  render(
    <table>
      <tbody>
        <PricingRow entry={value} onSave={onSave} />
      </tbody>
    </table>,
  );
  return onSave;
}

describe("PricingRow", () => {
  it("builds a PUT payload without display-only response fields", () => {
    const payload = buildPricingUpdatePayload(entry());
    expect(payload).not.toHaveProperty("model_name");
    expect(payload).not.toHaveProperty("provider");
    expect(payload).not.toHaveProperty("pricing_mode");
    expect(Object.keys(payload)).toHaveLength(9);
  });

  it("keeps text-only models in the simple two-rate editor", () => {
    renderRow(entry());
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Gemini Flash Lite input")).toBeVisible();
    expect(screen.getByLabelText("Gemini Flash Lite output")).toBeVisible();
    expect(screen.queryByText(/Rate modality/)).not.toBeInTheDocument();
  });

  it("shows six labelled rates for realtime models and saves their edits", () => {
    const onSave = renderRow(
      entry({
        model_id: "gpt-realtime-2.1-mini",
        model_name: "GPT Realtime 2.1 Mini",
        provider: "openai",
        pricing_mode: "realtime",
        input_price_usd_per_million: 0.6,
        output_price_usd_per_million: 2.4,
        input_text_price_usd_per_million: 0.6,
        cached_input_text_price_usd_per_million: 0.06,
        input_audio_price_usd_per_million: 10,
        cached_input_audio_price_usd_per_million: 0.3,
        output_text_price_usd_per_million: 2.4,
        output_audio_price_usd_per_million: 20,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getAllByRole("spinbutton")).toHaveLength(6);
    fireEvent.change(
      screen.getByLabelText("GPT Realtime 2.1 Mini Cached audio input"),
      { target: { value: "0.35" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        model_id: "gpt-realtime-2.1-mini",
        cached_input_audio_price_usd_per_million: 0.35,
      }),
    );
  });

  it("restores the current values after cancelling an edit", () => {
    renderRow(entry());
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Gemini Flash Lite input"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Gemini Flash Lite input")).toHaveValue(1);
  });
});
