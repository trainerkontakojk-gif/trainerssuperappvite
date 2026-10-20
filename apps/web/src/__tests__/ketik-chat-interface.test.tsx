import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KetikScenario, KetikSessionConfig } from "@trainers/types";

vi.mock("../routes/ketik/ketikApi", () => ({
  ketikApi: {
    sendTurn: vi.fn(),
    getSession: vi.fn(),
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
      session={{
        id: "chat-fixture",
        state: "active",
        version: 0,
        agentVersion: 0,
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        config,
        scenario,
        simulationSubject: {
          type: "self",
          participantId: null,
          displayName: "Trainer",
          batchName: null,
          team: null,
        },
        messages: [],
        consumerClosed: false,
        provenance: "server_v1",
        awaitingResponse: false,
        pendingResponse: null,
        pendingTurn: null,
      }}
      onEndSession={vi.fn()}
      {...overrides}
    />,
  );
}

// Clock/composer/serial sends are covered by ketik-session-api.spec.ts and
// ketik-server-chat.spec.ts. Keep the unrelated avatar checks below.
describe("KETIK ChatInterface consumer avatar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
});
