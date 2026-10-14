import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KetikScenario, KetikSessionConfig } from "@trainers/types";

const { mockGenerate } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
}));

vi.mock("../routes/ketik/ketikApi", () => ({
  ketikApi: {
    generate: mockGenerate,
  },
}));

import { ChatInterface } from "../routes/ketik/components/ChatInterface";
import { getKetikConsumerAvatarUrl } from "../routes/ketik/lib/ketik-avatar";

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

    fireEvent.change(screen.getByLabelText("Tulis balasan"), {
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
    expect(
      screen.getAllByText(
        "Maaf, saya harus lanjut aktivitas dulu. Nanti saya hubungi lagi ya. Terima kasih.",
      ),
    ).toHaveLength(1);
  });
});

describe("KETIK ChatInterface input/Send UX during loading", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockGenerate.mockReset();
  });

  it("keeps composer text at the same readable scale as chat bubbles", () => {
    renderChat();

    expect(screen.getByLabelText("Tulis balasan")).toHaveClass(
      "text-lg",
      "md:text-lg",
    );
  });

  it("keeps textarea enabled (not disabled) when isLoading is true", async () => {
    // Make generate() return a promise that never settles so isLoading stays true
    mockGenerate.mockReturnValue(new Promise<{ text: string }>(() => {}));

    renderChat();

    const input = screen.getByLabelText("Tulis balasan");
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
    const input = screen.getByLabelText("Tulis balasan");

    // Send a message to trigger isLoading
    fireEvent.change(input, { target: { value: "First message" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kirim pesan" }));
    });

    // While consumer is "typing" (isLoading true), user should be able to type
    fireEvent.change(input, {
      target: { value: "Second message during loading" },
    });
    expect(input).toHaveValue("Second message during loading");
  });

  it("keeps Send button enabled when isLoading is true and input is non-empty", async () => {
    mockGenerate.mockReturnValue(new Promise<{ text: string }>(() => {}));

    renderChat();
    const input = screen.getByLabelText("Tulis balasan");
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
    const input = screen.getByLabelText("Tulis balasan");

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
    const input = screen.getByLabelText("Tulis balasan");

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

describe("KETIK ChatInterface consumer avatar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockGenerate.mockReset();
  });

  it("uses a deterministic Random User photo with an initials fallback", () => {
    const { container } = renderChat();

    const avatar = container.querySelector('[data-slot="avatar"]');
    const avatarUrl = getKetikConsumerAvatarUrl(config.identity);

    expect(avatar).toBeTruthy();
    expect(avatar).toHaveAttribute("data-size", "lg");
    expect(avatar).toHaveClass("!size-14", "md:!size-16");
    expect(avatar).toHaveTextContent("J");
    expect(avatarUrl).toMatch(
      /^https:\/\/randomuser\.me\/api\/portraits\/(men|women)\/\d+\.jpg$/,
    );
    expect(getKetikConsumerAvatarUrl(config.identity)).toBe(avatarUrl);
  });

  it("matches known feminine consumer names to women portraits", () => {
    const avatarUrl = getKetikConsumerAvatarUrl({
      ...config.identity,
      name: "Indah Permatasari",
    });

    expect(avatarUrl).toContain("/women/");
  });

  it("removes the redundant greeting template button", () => {
    renderChat();

    expect(
      screen.queryByRole("button", { name: "Gunakan Template Salam" }),
    ).not.toBeInTheDocument();
  });
});
