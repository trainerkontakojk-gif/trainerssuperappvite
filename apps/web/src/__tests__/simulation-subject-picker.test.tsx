import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
const mockSubjectGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  profilerSubjectClient: {
    peserta: { options: { $get: mockSubjectGet } },
  },
  unwrapResponse: (value: unknown) => Promise.resolve(value),
}));

import { SimulationSubjectPicker } from "@/components/simulation/SimulationSubjectPicker";

const mockFetch = mockSubjectGet;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SimulationSubjectPicker", () => {
  it("defaults to self and confirms without search", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <SimulationSubjectPicker
        accountKey="u1"
        canPickParticipant
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mulai" }));
    expect(onConfirm).toHaveBeenCalledWith({ type: "self" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("requires minimum length and debounces search", async () => {
    mockFetch.mockResolvedValue([]);
    render(
      <SimulationSubjectPicker
        accountKey="u1"
        canPickParticipant
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Peserta resmi/));
    const input = screen.getByLabelText(/Cari peserta/);
    fireEvent.change(input, { target: { value: "a" } });
    expect(screen.getByText(/minimal 2 huruf/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "And" } });
    expect(mockFetch).not.toHaveBeenCalled();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
  });

  it("invalidates selected participant when search edited", async () => {
    mockFetch.mockResolvedValue([
      { id: "1", nama: "Andi", tim: "A", batch_name: "B12" },
    ]);
    render(
      <SimulationSubjectPicker
        accountKey="u1"
        canPickParticipant
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Peserta resmi/));
    fireEvent.change(screen.getByLabelText(/Cari peserta/), {
      target: { value: "And" },
    });
    await waitFor(() => expect(screen.getByText("Andi")).toBeInTheDocument(), {
      timeout: 2000,
    });
    fireEvent.click(screen.getByText("Andi"));
    expect(screen.getByText(/Terpilih/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Cari peserta/), {
      target: { value: "Andi X" },
    });
    expect(screen.queryByText(/Terpilih/)).not.toBeInTheDocument();
  });

  it("cancels on Escape without confirming", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <SimulationSubjectPicker
        accountKey="u1"
        canPickParticipant
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("guards double submit to single confirm", async () => {
    const onConfirm = vi.fn();
    render(
      <SimulationSubjectPicker
        accountKey="u1"
        canPickParticipant
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const btn = screen.getByRole("button", { name: "Mulai" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("moves focus with arrows and traps tab inside dialog", async () => {
    mockFetch.mockResolvedValue([
      { id: "1", nama: "Andi", tim: "A", batch_name: "B12" },
      { id: "2", nama: "Andini", tim: "A", batch_name: "B12" },
    ]);
    render(
      <SimulationSubjectPicker
        accountKey="u1"
        canPickParticipant
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Peserta resmi/));
    fireEvent.change(screen.getByLabelText(/Cari peserta/), {
      target: { value: "And" },
    });
    await waitFor(
      () => expect(screen.getByText("Andini")).toBeInTheDocument(),
      { timeout: 2000 },
    );
    const first = screen.getByText("Andi").closest("button")!;
    first.focus();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toContain("Andini");
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement?.textContent).toContain("Andi");
  });

  it("hides participant option for non-picker roles", () => {
    render(
      <SimulationSubjectPicker
        accountKey="u1"
        canPickParticipant={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Peserta resmi/)).not.toBeInTheDocument();
  });
});
