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

describe("KETIK ChatInterface input/Send UX during loading", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockGenerate.mockReset();
  });

  it("keeps textarea enabled (not disabled) when isLoading is true", async () => {
    // Make generate() return a promise that never settles so isLoading stays true
    mockGenerate.mockReturnValue(new Promise<{ text: string }>(() => {}));

    renderChat();

    const input = screen.getByLabelText("Tulis pesan KETIK");
    expect(input).not.toBeDisabled();

    // Type a message and send it — this triggers setIsLoading(true)
    fireEvent.change(input, { target: { value: "Test message" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));
    });

    // After send, input should still be enabled (not disabled by isLoading)
    expect(input).not.toBeDisabled();
    // Input should be cleared after send
    expect(input).toHaveValue("");
  });

  it("allows typing new text while consumer is responding", async () => {
    mockGenerate.mockReturnValue(new Promise<{ text: string }>(() => {}));

    renderChat();
    const input = screen.getByLabelText("Tulis pesan KETIK");

    // Send a message to trigger isLoading
    fireEvent.change(input, { target: { value: "First message" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));
    });

    // While consumer is "typing" (isLoading true), user should be able to type
    fireEvent.change(input, { target: { value: "Second message during loading" } });
    expect(input).toHaveValue("Second message during loading");
  });

  it("keeps Send button enabled when isLoading is true and input is non-empty", async () => {
    mockGenerate.mockReturnValue(new Promise<{ text: string }>(() => {}));

    renderChat();
    const input = screen.getByLabelText("Tulis pesan KETIK");
    const sendButton = screen.getByRole("button", { name: "Kirim pesan" });

    // Send first message to trigger isLoading
    fireEvent.change(input, { target: { value: "First" } });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    // Type another message during loading
    fireEvent.change(input, { target: { value: "Second" } });
    // Send button should NOT be disabled during loading
    expect(sendButton).not.toBeDisabled();
  });

  it("can send a second message while first generation is still in flight", async () => {
    // generate() stays pending for first call, then resolves for second
    let resolveFirst: ((v: { text: string }) => void) | null = null;
    mockGenerate.mockImplementation(() => {
      if (!resolveFirst) {
        return new Promise<{ text: string }>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({ text: "Response for second" });
    });

    renderChat();
    const input = screen.getByLabelText("Tulis pesan KETIK");

    // Send first message — it triggers generate() which stays pending
    fireEvent.change(input, { target: { value: "First message" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));
    });
    // Input cleared, first message added to chat
    expect(input).toHaveValue("");

    // Immediately type and send a second message while first is still in-flight
    fireEvent.change(input, { target: { value: "Second message" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));
    });
    expect(input).toHaveValue("");

    // Second generate call should have been made
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    // The second call should have BOTH messages in chatHistory
    const secondCallArg = mockGenerate.mock.calls[1][0];
    expect(secondCallArg.chatHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "First message", sender: "agent" }),
        expect.objectContaining({ text: "Second message", sender: "agent" }),
      ]),
    );
  });

  it("allows Enter key to send message while isLoading is true", async () => {
    mockGenerate.mockReturnValue(new Promise<{ text: string }>(() => {}));

    renderChat();
    const input = screen.getByLabelText("Tulis pesan KETIK");

    // Send first message
    fireEvent.change(input, { target: { value: "First" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));
    });

    // Type and press Enter while isLoading is true
    fireEvent.change(input, { target: { value: "Second via Enter" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Enter should trigger handleSend -> generate should be called again
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(input).toHaveValue("");
  });
});
