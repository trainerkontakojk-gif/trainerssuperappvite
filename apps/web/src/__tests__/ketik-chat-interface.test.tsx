import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChatMessage,
  KetikScenario,
  KetikSessionConfig,
} from "@trainers/types";

const { mockGenerate } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
}));

vi.mock("../routes/ketik/ketikApi", () => ({
  ketikApi: {
    generate: mockGenerate,
  },
}));

import { ChatInterface } from "../routes/ketik/components/ChatInterface";

const scenario: KetikScenario = {
  id: "scenario-1",
  category: "Perbankan",
  title: "Tagihan Kartu Kredit",
  description: "Konsumen mempertanyakan tagihan kartu kredit.",
  isActive: true,
};

const config: KetikSessionConfig = {
  scenarios: [scenario],
  consumerType: {
    id: "consumer-1",
    name: "Kritis & Detail",
    description: "Konsumen teliti.",
    difficulty: "Sulit",
  },
  identity: {
    name: "José",
    city: "Jakarta",
    phone: "08123456789",
  },
  selectedModel: "gemini-3.1-flash-lite",
  simulationDuration: 1,
  responsePacingMode: "training_fast",
};

const initialMessages: ChatMessage[] = [
  {
    id: "message-1",
    sender: "consumer",
    text: 'Pengaduan kartu kredit – nasabah José #1, "urgent"\nBaris 2',
    timestamp: "2026-07-11T00:00:00.000Z",
  },
];

function renderChat(
  overrides: Partial<React.ComponentProps<typeof ChatInterface>> = {},
) {
  return render(
    <ChatInterface
      config={config}
      scenario={scenario}
      onEndSession={vi.fn()}
      {...overrides}
    />,
  );
}

describe("KETIK ChatInterface session clock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockGenerate.mockReset();
  });

  it("keeps remaining and elapsed time consistent with one interval source", async () => {
    const intervalRegistrations: Array<{ handler: () => void; delay: number }> =
      [];
    vi.spyOn(globalThis, "setInterval").mockImplementation(((
      handler: () => void,
      delay: number,
    ) => {
      intervalRegistrations.push({ handler, delay });
      return 1;
    }) as typeof setInterval);
    mockGenerate.mockResolvedValue({ text: "" });

    renderChat();
    const sessionIntervals = intervalRegistrations.filter(
      ({ delay }) => delay === 1000,
    );
    expect(sessionIntervals).toHaveLength(1);

    act(() => {
      for (let second = 0; second < 10; second += 1) {
        sessionIntervals[0].handler();
      }
    });

    fireEvent.change(screen.getByLabelText("Tulis pesan KETIK"), {
      target: { value: "Saya bantu cek dulu." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));
    });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        remainingSeconds: 50,
        elapsedSeconds: 10,
      }),
    );
  });

  it("expires once at the duration boundary and never goes negative", () => {
    const intervalRegistrations: Array<{ handler: () => void; delay: number }> =
      [];
    vi.spyOn(globalThis, "setInterval").mockImplementation(((
      handler: () => void,
      delay: number,
    ) => {
      intervalRegistrations.push({ handler, delay });
      return 1;
    }) as typeof setInterval);

    renderChat();
    const sessionIntervals = intervalRegistrations.filter(
      ({ delay }) => delay === 1000,
    );
    expect(sessionIntervals).toHaveLength(1);
    act(() => {
      for (let second = 0; second < 60; second += 1) {
        sessionIntervals[0].handler();
      }
    });

    expect(
      screen.getByText(
        "Maaf, saya harus lanjut aktivitas dulu. Nanti saya hubungi lagi ya. Terima kasih.",
      ),
    ).toBeDefined();
    expect(screen.getByText("1:00")).toBeDefined();
    expect(
      screen.getAllByText(
        "Maaf, saya harus lanjut aktivitas dulu. Nanti saya hubungi lagi ya. Terima kasih.",
      ),
    ).toHaveLength(1);
  });

  it("keeps elapsed time running during the expired grace phase", () => {
    const intervalRegistrations: Array<{ handler: () => void; delay: number }> =
      [];
    vi.spyOn(globalThis, "setInterval").mockImplementation(((
      handler: () => void,
      delay: number,
    ) => {
      intervalRegistrations.push({ handler, delay });
      return intervalRegistrations.length;
    }) as typeof setInterval);

    renderChat();
    expect(intervalRegistrations).toHaveLength(1);

    act(() => {
      for (let second = 0; second < 60; second += 1) {
        intervalRegistrations[0].handler();
      }
    });

    expect(intervalRegistrations).toHaveLength(2);

    act(() => {
      for (let second = 0; second < 5; second += 1) {
        intervalRegistrations[1].handler();
      }
    });

    expect(screen.getByText("1:05")).toBeDefined();
  });
});

describe("KETIK ChatInterface CSV export", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("exports a UTF-8 BOM Blob and revokes its object URL", async () => {
    let capturedBlob: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:ketik-review";
    });
    const revokeObjectURL = vi.fn();
    let downloadedFileName = "";
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedFileName = this.download;
      });

    renderChat({ isReviewMode: true, initialMessages });
    fireEvent.click(
      screen.getByRole("button", { name: "Download transcript CSV" }),
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:ketik-review");
    expect(click).toHaveBeenCalledTimes(1);
    expect(downloadedFileName).toMatch(/^chat_review_\d+\.csv$/);
    expect(capturedBlob).toBeDefined();
    expect(capturedBlob?.type).toBe("text/csv;charset=utf-8");

    const bytes = new Uint8Array(await capturedBlob!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes.slice(3));
    expect(csv.startsWith("Pengirim,Pesan,Waktu")).toBe(true);
    expect(csv).toContain(
      '"Konsumen","Pengaduan kartu kredit – nasabah José #1, ""urgent""\nBaris 2"',
    );
  });
});
