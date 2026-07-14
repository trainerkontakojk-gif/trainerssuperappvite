import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import GlobalBirthdaysWidget from "../routes/profiler/components/workspace/GlobalBirthdaysWidget";

const mockGetUpcomingBirthdays = vi.fn();

vi.mock("../lib/profilerService", () => ({
  profilerApi: {
    getUpcomingBirthdays: (...args: any[]) => mockGetUpcomingBirthdays(...args),
  },
}));

const sample = [
  { id: "1", nama: "Siti Nur Anisa", tgl_lahir: "1998-03-12", batch_name: "Batch A", daysUntil: 0, age: 28 },
  { id: "2", nama: "Muhammad Fahmi", tgl_lahir: "1995-07-25", batch_name: "Batch B", daysUntil: 4, age: 31 },
  { id: "3", nama: "Dwiana Amelia", tgl_lahir: "2000-11-02", batch_name: "Batch C", daysUntil: 15, age: 26 },
];

describe("GlobalBirthdaysWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a single card showing the nearest birthday, opens popup on click", async () => {
    mockGetUpcomingBirthdays.mockResolvedValue(sample);
    render(<GlobalBirthdaysWidget />);

    expect(screen.getByText("Ulang Tahun Terdekat")).toBeInTheDocument();
    expect(screen.getByText("Seluruh data")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Siti Nur Anisa")).toBeInTheDocument();
    });

    // Card summary shows the nearest person only
    expect(screen.getByText("Hari ini!")).toBeInTheDocument();
    // Full list is NOT shown until the card is clicked
    expect(screen.queryByText("4 HARI LAGI")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ulang Tahun Terdekat/i }));

    await waitFor(() => {
      expect(screen.getByText("4 HARI LAGI")).toBeInTheDocument();
    });
    expect(screen.getByText("15 HARI LAGI")).toBeInTheDocument();
    expect(screen.getByText("Muhammad Fahmi")).toBeInTheDocument();
    expect(screen.getByText("Menampilkan 5 data terdekat")).toBeInTheDocument();
  });

  it("shows empty state in popup when no data", async () => {
    mockGetUpcomingBirthdays.mockResolvedValue([]);
    render(<GlobalBirthdaysWidget />);

    await waitFor(() => {
      expect(screen.getByText("No data available")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Ulang Tahun Terdekat/i }));

    await waitFor(() => {
      expect(screen.getByText("Tidak ada data ulang tahun.")).toBeInTheDocument();
    });
  });

  it("shows error state with retry button on failure", async () => {
    mockGetUpcomingBirthdays.mockRejectedValueOnce(new Error("DB down"));
    mockGetUpcomingBirthdays.mockResolvedValueOnce(sample);
    render(<GlobalBirthdaysWidget />);

    await waitFor(() => {
      expect(screen.getByText("DB down")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Ulang Tahun Terdekat/i }));

    await waitFor(() => {
      expect(screen.getByText("Coba lagi")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Coba lagi/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Siti Nur Anisa").length).toBeGreaterThan(0);
    });
    expect(mockGetUpcomingBirthdays).toHaveBeenCalledTimes(2);
  });
});
