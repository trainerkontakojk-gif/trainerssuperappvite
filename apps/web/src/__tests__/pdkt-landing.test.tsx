import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseApi = vi.fn();
const mockGetApi = vi.fn();
const mockPostApi = vi.fn();
const mockDeleteApi = vi.fn();

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: any[]) => mockUseApi(...args),
  getApi: (...args: any[]) => mockGetApi(...args),
  postApi: (...args: any[]) => mockPostApi(...args),
  deleteApi: (...args: any[]) => mockDeleteApi(...args),
}));

import PdktLanding from "../routes/pdkt/index";

describe("PDKT Landing Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApi.mockReturnValue({
      data: null,
      loading: false,
      refetch: vi.fn(),
    });
    mockGetApi.mockImplementation((url: string) => {
      if (url === "/pdkt/settings") return Promise.resolve(null);
      if (url === "/pdkt/history") return Promise.resolve([]);
      if (url.startsWith("/ai/usage/summary"))
        return Promise.resolve({
          totalCalls: 0,
          totalTokens: 0,
          totalCostIdr: 0,
        });
      return Promise.resolve(null);
    });
    mockPostApi.mockResolvedValue(null);
    mockDeleteApi.mockResolvedValue(null);
  });

  it("renders workspace intro with correct eyebrow", async () => {
    render(<PdktLanding />);
    await screen.findByText("Paham Dulu Kasih Tanggapan");
  });

  it("renders correct heading", async () => {
    render(<PdktLanding />);
    await screen.findByText(
      "Buka simulasi email dengan pengalaman workspace yang seragam.",
    );
  });

  it("renders description containing expected text", async () => {
    render(<PdktLanding />);
    await screen.findByText(/Atur skenario, telaah riwayat evaluasi/);
  });

  it("renders Workspace actions section", async () => {
    render(<PdktLanding />);
    await screen.findByText("Workspace actions");
  });

  it("renders action buttons in exact order", async () => {
    render(<PdktLanding />);
    const mulaiBtn = await screen.findByText("Mulai Simulasi");
    const pengaturanBtn = screen.getByText("Pengaturan");
    const riwayatBtn = screen.getByText("Riwayat");
    const usageBtn = screen.getByText("Usage Bulan Ini");

    expect(mulaiBtn.parentElement).not.toBeNull();
    expect(pengaturanBtn.parentElement).not.toBeNull();
    expect(riwayatBtn.parentElement).not.toBeNull();
    expect(usageBtn.parentElement).not.toBeNull();

    const docPosition = (el: Element) => {
      const all = document.querySelectorAll("button");
      return Array.from(all).indexOf(el as HTMLButtonElement);
    };

    expect(docPosition(mulaiBtn.closest("button")!)).toBeLessThan(
      docPosition(pengaturanBtn.closest("button")!),
    );
    expect(docPosition(pengaturanBtn.closest("button")!)).toBeLessThan(
      docPosition(riwayatBtn.closest("button")!),
    );
    expect(docPosition(riwayatBtn.closest("button")!)).toBeLessThan(
      docPosition(usageBtn.closest("button")!),
    );
  });

  it("does not render old card grid copy", async () => {
    render(<PdktLanding />);
    await screen.findByText("Workspace actions");
    expect(screen.queryByText("Tentang PDKT")).toBeNull();
    expect(screen.queryByText("Riwayat Sesi")).toBeNull();
    expect(
      screen.queryByText("Pilih skenario dan mulai simulasi email"),
    ).toBeNull();
  });

  it("opens mailbox workspace when Mulai Simulasi is clicked", async () => {
    mockUseApi.mockImplementation((url: string) => {
      if (url === "/pdkt/mailbox")
        return { data: [], loading: false, refetch: vi.fn() };
      if (url === "/pdkt/scenarios")
        return { data: [], loading: false, refetch: vi.fn() };
      if (url === "/pdkt/consumer-types")
        return { data: [], loading: false, refetch: vi.fn() };
      return { data: null, loading: false, refetch: vi.fn() };
    });
    const user = userEvent.setup();
    render(<PdktLanding />);
    const mulaiBtn = await screen.findByText("Mulai Simulasi");
    await user.click(mulaiBtn);
    await screen.findByText(/Pilih email atau buat simulasi baru/);
  });

  it("opens settings modal when Pengaturan is clicked", async () => {
    const user = userEvent.setup();
    render(<PdktLanding />);
    const btn = await screen.findByText("Pengaturan");
    await user.click(btn);
    await screen.findByText("Pengaturan Simulasi");
  });

  it("opens history modal when Riwayat is clicked", async () => {
    const user = userEvent.setup();
    render(<PdktLanding />);
    const btn = await screen.findByText("Riwayat");
    await user.click(btn);
    await screen.findByText("Riwayat Simulasi PDKT");
  });

  it("opens usage modal when Usage Bulan Ini is clicked", async () => {
    const user = userEvent.setup();
    render(<PdktLanding />);
    const btn = await screen.findByText("Usage Bulan Ini");
    await user.click(btn);
    await screen.findByText(/Estimasi biaya/);
  });
});
