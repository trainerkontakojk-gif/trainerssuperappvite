import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsModal } from "../routes/pdkt/components/SettingsModal";
import type { PdktAppSettings as AppSettings } from "../routes/pdkt/pdktSettings";
import { ApiError } from "../lib/api";
import { notify } from "../lib/toast";

vi.mock("framer-motion", async () => {
  const actual = (await vi.importActual("framer-motion")) as any;
  return {
    ...actual,
    motion: {
      ...actual.motion,
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});
const apiMocks = vi.hoisted(() => ({
  generateIdentity: vi.fn(),
  generateTemplate: vi.fn(),
  unwrapResponse: vi.fn(),
}));
vi.mock("../lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    pdktClient: {
      "generate-identity": { $post: apiMocks.generateIdentity },
      "generate-template": { $post: apiMocks.generateTemplate },
    },
    unwrapResponse: apiMocks.unwrapResponse,
  };
});
vi.mock("../lib/toast", () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const initialSettings: AppSettings = {
  scenarios: [
    {
      id: "s-1",
      category: "Kepatuhan",
      title: "SOP",
      description: "Deskripsi",
      isActive: true,
    },
  ],
  consumerTypes: [
    {
      id: "c-1",
      name: "Nasabah Ramah",
      description: "Kooperatif",
      difficulty: "Easy",
    },
  ],
  enableImageGeneration: true,
  globalConsumerTypeId: "random",
  selectedModel: "gemini-3.1-flash-lite",
  consumerNameMentionPattern: "random",
  writingStyleMode: "training",
  customIdentity: {
    senderName: "Jane Doe",
    email: "jane@example.com",
    city: "Bandung",
    bodyName: "Jane",
  },
};

function renderModal(
  overrides: Partial<React.ComponentProps<typeof SettingsModal>> = {},
) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <SettingsModal
      isOpen
      onClose={onClose}
      settings={initialSettings}
      onSave={onSave}
      defaultScenarios={initialSettings.scenarios}
      defaultConsumerTypes={initialSettings.consumerTypes}
      {...overrides}
    />,
  );
  return { onSave, onClose };
}

async function completeScenarioStage(
  user: ReturnType<typeof userEvent.setup>,
  title = " Wizard",
) {
  await user.selectOptions(screen.getByLabelText(/Kategori/), "Kepatuhan");
  fireEvent.change(
    screen.getByPlaceholderText("Contoh: Kesalahan Transaksi Real-time"),
    { target: { value: title } },
  );
  fireEvent.change(
    screen.getByPlaceholderText(
      "Jelaskan konteks masalah yang harus diselesaikan oleh agen...",
    ),
    { target: { value: " Konteks" } },
  );
  await user.click(screen.getByRole("button", { name: "Lanjut" }));
}

async function fillScenarioIdentity(identity: {
  senderName: string;
  bodyName: string;
  email: string;
  city: string;
}) {
  fireEvent.change(screen.getByLabelText(/Nama pengirim/), {
    target: { value: identity.senderName },
  });
  fireEvent.change(screen.getByLabelText(/Nama panggilan/), {
    target: { value: identity.bodyName },
  });
  fireEvent.change(document.getElementById("custom-email")!, {
    target: { value: identity.email },
  });
  fireEvent.change(screen.getByLabelText(/Kota/, { selector: "input" }), {
    target: { value: identity.city },
  });
}

async function createScenarioWithIdentity(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
  identity: {
    senderName: string;
    bodyName: string;
    email: string;
    city: string;
  },
) {
  await user.click(
    screen.getByRole("button", { name: /tambah skenario baru/i }),
  );
  await completeScenarioStage(user, title);
  fillScenarioIdentity(identity);
  await user.click(screen.getByRole("button", { name: "Lanjut" }));
  await user.click(screen.getByRole("button", { name: "Buat Skenario" }));
}

async function reachEmailStage(user: ReturnType<typeof userEvent.setup>) {
  await completeScenarioStage(user);
  await user.click(screen.getByRole("button", { name: "Lanjut" }));
}

describe("PDKT scenario wizard", () => {
  it("shows the Gemini/OpenAI-only model registry in the system tab", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: "Sistem" }));

    [
      "Gemini 3.7 Flash",
      "Gemini 3.5 Flash Lite",
      "GPT 5.6 Luna",
      "GPT 5.4 Mini",
    ].forEach((name) => {
      expect(screen.getByText(name)).toBeDefined();
    });
    expect(screen.queryByText(/OpenRouter/i)).toBeNull();
    expect(screen.queryByText(/DeepSeek/i)).toBeNull();
    expect(screen.getAllByText("Gemini").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    apiMocks.generateIdentity.mockReset();
    apiMocks.generateTemplate.mockReset();
    apiMocks.unwrapResponse.mockReset();
    apiMocks.unwrapResponse.mockImplementation(async (value: unknown) => value);
  });

  it("renders the exact three-stage contract and disables invalid progress", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    expect(screen.getByText("1. Skenario")).toBeDefined();
    expect(
      screen.getByText(
        "Jelaskan situasi yang akan dihadapi agent dalam simulasi email.",
        { exact: true },
      ),
    ).toBeDefined();
    expect(screen.getByText("2. Profil Pengirim")).toBeDefined();
    expect(screen.getByText("3. Email & Pengaturan")).toBeDefined();
    expect(screen.getByRole("button", { name: "Lanjut" })).toBeDisabled();
    expect(screen.getAllByText("Wajib").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Opsional").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Batal" })).toBeDefined();
  });

  it("shows and updates the scenario description character counter", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );

    const description = screen.getByPlaceholderText(
      "Jelaskan konteks masalah yang harus diselesaikan oleh agen...",
    );
    expect(screen.getByText("0 / 50.000")).toBeDefined();
    expect(description).toHaveAttribute("maxLength", "50000");
    expect(description).toHaveAttribute(
      "aria-describedby",
      "scenario-description-counter",
    );
    expect(screen.queryByText("Deskripsi masalah wajib diisi.")).toBeNull();

    fireEvent.change(description, { target: { value: "Konteks" } });
    expect(screen.getByText("7 / 50.000")).toBeDefined();

    await user.clear(description);
    await user.click(
      screen.getByRole("button", { name: /2\. Profil Pengirim/ }),
    );
    expect(screen.getByText("Deskripsi masalah wajib diisi.")).toBeDefined();
    expect(description).toHaveAttribute(
      "aria-describedby",
      "scenario-description-counter scenario-description-error",
    );
  });

  it("does not truncate a loaded over-limit scenario description", async () => {
    const user = userEvent.setup();
    renderModal({
      settings: {
        ...initialSettings,
        scenarios: [
          {
            ...initialSettings.scenarios[0],
            description: "x".repeat(50_001),
          },
        ],
      },
    });

    await user.click(screen.getByTitle("Edit"));

    const description = screen.getByPlaceholderText(
      "Jelaskan konteks masalah yang harus diselesaikan oleh agen...",
    );
    expect(description).toHaveValue("x".repeat(50_001));
    expect(screen.getByText("50.001 / 50.000")).toBeDefined();
  });

  // These multi-stage user-event flows are intentionally scoped to 15s because
  // they exercise the complete wizard rather than a single interaction.
  it(
    "keeps optional profile fields passable and retains values across stages",
    { timeout: 15000 },
    async () => {
      const user = userEvent.setup();
      renderModal({
        settings: {
          ...initialSettings,
          customIdentity: { senderName: "", email: "", city: "", bodyName: "" },
        },
      });
      await user.click(
        screen.getByRole("button", { name: /tambah skenario baru/i }),
      );
      await completeScenarioStage(user);
      expect(screen.getByText("Profil Pengirim")).toBeDefined();
      expect(screen.getByRole("button", { name: "Lanjut" })).not.toBeDisabled();
      await user.type(screen.getByLabelText(/Nama pengirim/), "Profil Baru");
      await user.click(screen.getByRole("button", { name: "Lanjut" }));
      expect(screen.getByText("Konfigurasi Email")).toBeDefined();
      expect(
        document.getElementById("simulation-settings-title"),
      ).toBeDefined();
      await user.click(screen.getByRole("button", { name: "Kembali" }));
      expect(
        screen.getByRole("button", { name: /3\. Email & Pengaturan, Selesai/ }),
      ).toBeDefined();
      expect(screen.getByDisplayValue("Profil Baru")).toBeDefined();
    },
  );

  it("uses the generated fallback identity for blank scenario and global values when generating templates", async () => {
    const user = userEvent.setup();
    const generatedFallbackIdentity = {
      name: "Generated Sender",
      bodyName: "Generated Body",
      email: "generated@example.com",
      city: "Generated City",
    };
    apiMocks.generateIdentity.mockResolvedValue(generatedFallbackIdentity);
    apiMocks.generateTemplate.mockResolvedValue({
      subject: "Template Subject",
      body: "Template Body",
    });
    renderModal({
      settings: {
        ...initialSettings,
        customIdentity: {
          senderName: "",
          email: "",
          city: "",
          bodyName: "",
        },
      },
    });

    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await reachEmailStage(user);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Generate" }),
      ).not.toBeDisabled(),
    );
    await user.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(apiMocks.generateIdentity).toHaveBeenCalledTimes(1),
    );
    expect(apiMocks.generateTemplate).toHaveBeenCalledTimes(1);
    expect(apiMocks.generateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          identity: generatedFallbackIdentity,
        }),
      }),
    );
  });

  it(
    "isolates scenario identity from global identity and saves the override",
    { timeout: 15000 },
    async () => {
      const user = userEvent.setup();
      const { onSave } = renderModal();
      await user.click(
        screen.getByRole("button", { name: /tambah skenario baru/i }),
      );
      await completeScenarioStage(user);

      const scenarioName = screen.getByLabelText(/Nama pengirim/);
      const scenarioBodyName = screen.getByLabelText(/Nama panggilan/);
      await user.clear(scenarioName);
      await user.type(scenarioName, "Scenario Sender");
      await user.clear(scenarioBodyName);
      await user.type(scenarioBodyName, "Scenario");
      const scenarioEmail = document.getElementById("custom-email")!;
      await user.clear(scenarioEmail);
      await user.type(scenarioEmail, "scenario@example.com");
      await user.type(
        screen.getByLabelText(/Kota/, { selector: "input" }),
        "Surabaya",
      );
      expect(
        screen.getByText(
          "Berlaku khusus untuk skenario ini. Field kosong akan memakai nilai skenario terkait, lalu identitas default.",
        ),
      ).toBeDefined();

      await user.click(screen.getByRole("button", { name: "Lanjut" }));
      await user.click(screen.getByRole("button", { name: "Buat Skenario" }));
      await user.click(
        screen.getByRole("button", { name: /simpan perubahan/i }),
      );

      const savedSettings = onSave.mock.calls[0][0];
      expect(savedSettings.customIdentity).toEqual(
        initialSettings.customIdentity,
      );
      expect(savedSettings.scenarios).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            identity: {
              name: "Scenario Sender",
              bodyName: "Scenario",
              email: "scenario@example.com",
              city: "Surabaya",
            },
          }),
        ]),
      );
    },
  );

  it(
    "keeps distinct scenario identity overrides isolated when reopening each edit",
    { timeout: 15000 },
    async () => {
      const user = userEvent.setup();
      renderModal();

      await createScenarioWithIdentity(user, " Alpha", {
        senderName: "Alpha Sender",
        bodyName: "Alpha",
        email: "alpha@example.com",
        city: "Alpha City",
      });
      await createScenarioWithIdentity(user, " Beta", {
        senderName: "Beta Sender",
        bodyName: "Beta",
        email: "beta@example.com",
        city: "Beta City",
      });

      await waitFor(() => expect(screen.getAllByTitle("Edit")).toHaveLength(3));
      await user.click(screen.getAllByTitle("Edit")[1]);
      await user.click(screen.getByRole("button", { name: "Lanjut" }));
      expect(screen.getByLabelText(/Nama pengirim/)).toHaveValue(
        "Alpha Sender",
      );
      expect(screen.getByLabelText(/Nama panggilan/)).toHaveValue("Alpha");
      expect(document.getElementById("custom-email")).toHaveValue(
        "alpha@example.com",
      );
      expect(screen.getByLabelText(/Kota/, { selector: "input" })).toHaveValue(
        "Alpha City",
      );
      await user.click(
        screen.getByRole("button", { name: "Tutup wizard skenario" }),
      );
      await waitFor(() => expect(screen.getAllByTitle("Edit")).toHaveLength(3));

      await user.click(screen.getAllByTitle("Edit")[2]);
      await user.click(screen.getByRole("button", { name: "Lanjut" }));
      expect(screen.getByLabelText(/Nama pengirim/)).toHaveValue("Beta Sender");
      expect(screen.getByLabelText(/Nama panggilan/)).toHaveValue("Beta");
      expect(document.getElementById("custom-email")).toHaveValue(
        "beta@example.com",
      );
      expect(screen.getByLabelText(/Kota/, { selector: "input" })).toHaveValue(
        "Beta City",
      );
    },
  );

  it("canceling a scenario identity edit leaves the global identity unchanged", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await completeScenarioStage(user);
    const scenarioName = screen.getByLabelText(/Nama pengirim/);
    await user.clear(scenarioName);
    await user.type(scenarioName, "Canceled Scenario");
    await user.click(
      screen.getByRole("button", { name: "Tutup wizard skenario" }),
    );
    await user.click(screen.getByRole("button", { name: "Identitas" }));
    expect(screen.getByLabelText(/Nama Pengirim \(Header\)/)).toHaveValue(
      "Jane Doe",
    );
  });

  it("shows two profile cards and all stage 3 settings immediately", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await reachEmailStage(user);
    expect(screen.getByText("Identitas Pengirim")).toBeDefined();
    expect(screen.getByText("Karakter dan Gaya Komunikasi")).toBeDefined();
    expect(screen.getByText("Konfigurasi Email")).toBeDefined();
    expect(document.getElementById("simulation-settings-title")).toBeDefined();
    expect(screen.getByLabelText(/Penerima Utama/)).toBeDefined();
    expect(screen.getByLabelText(/Mode Penerima/)).toBeDefined();
    expect(screen.getByLabelText(/Buat gambar/)).toBeDefined();
    expect(screen.getByLabelText(/Model AI/)).toBeDefined();
    expect(screen.getByLabelText(/Gaya penulisan/)).toBeDefined();
    expect(
      screen.getByRole("textbox", { name: "Subjek Template Email Opsional" }),
    ).toBeDefined();
    expect(
      screen.getByRole("textbox", { name: "Isi Template Email Opsional" }),
    ).toBeDefined();
    expect(screen.getByText("Pilih Gambar / PDF")).toBeDefined();
    expect(screen.queryByText("Pengaturan Lanjutan")).toBeNull();
    expect(screen.queryByTestId("advanced-summary")).toBeNull();
  });

  it("preserves normalized OJK recipients through the three-stage wizard and outer save", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();
    fireEvent.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await completeScenarioStage(user);
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

    fireEvent.change(screen.getByLabelText(/Penerima Utama/), {
      target: { value: "ojk" },
    });
    fireEvent.change(screen.getByLabelText(/Mode Penerima/), {
      target: { value: "multiple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tambah alamat" }));
    const firstRecipient = screen.getByRole("textbox", {
      name: "Alamat email tambahan 1",
    });
    fireEvent.change(firstRecipient, {
      target: { value: "Compliance@Example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tambah alamat" }));
    const secondRecipient = screen.getByRole("textbox", {
      name: "Alamat email tambahan 2",
    });
    fireEvent.change(secondRecipient, {
      target: { value: "audit@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Buat Skenario" }));
    expect(screen.queryByRole("button", { name: "Buat Skenario" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Simpan Perubahan" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedSettings = onSave.mock.calls[0][0];
    const savedScenario = savedSettings.scenarios.find(
      (scenario: AppSettings["scenarios"][number]) =>
        scenario.title.includes("Wizard"),
    );
    expect(savedScenario).toEqual(
      expect.objectContaining({
        primaryRecipientType: "ojk",
        recipientMode: "multiple",
        recipientEmails: ["compliance@example.com", "audit@example.com"],
      }),
    );
    expect(savedScenario).not.toHaveProperty("isLicensed");
  });

  it("preserves legacy and supported scenario fields during an unrelated global save", async () => {
    const user = userEvent.setup();
    const legacyScenario = {
      id: "legacy-scenario",
      category: "Kepatuhan",
      title: "Legacy SOP",
      description: "Legacy description",
      isActive: false,
      primaryRecipientType: "reported_company",
      recipientMode: "multiple",
      recipientEmails: ["Legacy@Example.com"],
      script: "Legacy script",
      sampleEmailTemplate: { subject: "Legacy subject", body: "Legacy body" },
      alwaysUseSampleEmail: true,
      attachmentImages: ["data:image/png;base64,legacy"],
      isLicensed: true,
      legacyMetadata: { importedFrom: "v1" },
    } as unknown as AppSettings["scenarios"][number];
    const { onSave } = renderModal({
      settings: { ...initialSettings, scenarios: [legacyScenario] },
    });

    await user.click(screen.getByRole("button", { name: "Sistem" }));
    await user.click(screen.getByText("Realistis", { selector: "h4" }));
    await user.click(screen.getByRole("button", { name: "Simpan Perubahan" }));

    expect(onSave).toHaveBeenCalled();
    const savedScenario = onSave.mock.calls.at(-1)![0].scenarios[0];
    expect(savedScenario).toMatchObject({
      id: "legacy-scenario",
      category: "Kepatuhan",
      title: "Legacy SOP",
      description: "Legacy description",
      isActive: false,
      primaryRecipientType: "reported_company",
      recipientMode: "multiple",
      recipientEmails: ["legacy@example.com"],
      script: "Legacy script",
      sampleEmailTemplate: { subject: "Legacy subject", body: "Legacy body" },
      alwaysUseSampleEmail: true,
      attachmentImages: ["data:image/png;base64,legacy"],
      legacyMetadata: { importedFrom: "v1" },
    });
    expect(savedScenario).not.toHaveProperty("isLicensed");
    expect(onSave.mock.calls.at(-1)![0].writingStyleMode).toBe("realistic");
  });

  it("keeps invalid recipient validation visible and focused on final save", async () => {
    const user = userEvent.setup();
    renderModal();
    fireEvent.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await reachEmailStage(user);
    fireEvent.click(screen.getByRole("button", { name: /tambah alamat/i }));
    fireEvent.change(screen.getByPlaceholderText("alamat.tujuan@domain.com"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buat Skenario" }));
    expect(screen.getByText(/format email tidak valid/i)).toBeDefined();
    expect(
      screen.getByPlaceholderText("alamat.tujuan@domain.com"),
    ).toHaveAttribute("aria-invalid", "true");
  });

  it("focuses the first invalid recipient row on final save", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await reachEmailStage(user);
    await user.click(screen.getByRole("button", { name: /tambah alamat/i }));
    await user.click(screen.getByRole("button", { name: /tambah alamat/i }));

    const recipientInputs = screen.getAllByPlaceholderText(
      "alamat.tujuan@domain.com",
    );
    fireEvent.change(recipientInputs[0], {
      target: { value: "valid@example.com" },
    });
    fireEvent.change(recipientInputs[1], { target: { value: "bad" } });

    await user.click(screen.getByRole("button", { name: "Buat Skenario" }));

    expect(screen.getByText(/format email tidak valid/i)).toBeDefined();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Alamat email tambahan 2" }),
      ),
    );
    expect(
      screen.getByRole("textbox", { name: "Alamat email tambahan 1" }),
    ).not.toHaveAttribute("aria-invalid", "true");
  });

  it("accepts PDF attachments and saves only supported normalized scenario fields", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await reachEmailStage(user);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toContain("application/pdf");
    await user.upload(
      input,
      new File(["%PDF"], "evidence.pdf", { type: "application/pdf" }),
    );
    await waitFor(() => expect(screen.getByText("PDF")).toBeDefined());
    expect(
      screen.getByRole("button", { name: "Hapus lampiran 1" }),
    ).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Buat Skenario" }));
    await user.click(screen.getByRole("button", { name: /simpan perubahan/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarios: expect.arrayContaining([
          expect.objectContaining({
            category: "Kepatuhan",
            title: expect.stringContaining("Wizard"),
            description: expect.stringContaining("Konteks"),
            isActive: true,
            recipientMode: "single",
            recipientEmails: [],
            alwaysUseSampleEmail: false,
            attachmentImages: [
              expect.stringMatching(/^data:application\/pdf;base64,/),
            ],
          }),
        ]),
      }),
    );
  });

  it("removes an attachment through its accessible control", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await reachEmailStage(user);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(
      input,
      new File(["%PDF"], "evidence.pdf", { type: "application/pdf" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Hapus lampiran 1" }),
      ).toBeDefined(),
    );
    await user.click(screen.getByRole("button", { name: "Hapus lampiran 1" }));
    expect(
      screen.queryByRole("button", { name: "Hapus lampiran 1" }),
    ).toBeNull();
  });

  it("accumulates out-of-order attachment reads and blocks wizard save until reads finish", async () => {
    class ControlledFileReader {
      static instances: ControlledFileReader[] = [];
      result: string | null = null;
      onloadend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        ControlledFileReader.instances.push(this);
      }

      complete(result: string) {
        this.result = result;
        this.onloadend?.();
      }
    }

    vi.stubGlobal("FileReader", ControlledFileReader);
    try {
      const user = userEvent.setup();
      const { onSave } = renderModal();
      await user.click(
        screen.getByRole("button", { name: /tambah skenario baru/i }),
      );
      await reachEmailStage(user);
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, {
        target: {
          files: [new File(["one"], "one.pdf", { type: "application/pdf" })],
        },
      });
      fireEvent.change(input, {
        target: {
          files: [new File(["two"], "two.png", { type: "image/png" })],
        },
      });
      expect(ControlledFileReader.instances).toHaveLength(2);
      const wizardSave = screen.getByRole("button", { name: "Buat Skenario" });
      await waitFor(() => expect(wizardSave).toBeDisabled());
      await user.click(wizardSave);
      expect(
        screen.getByRole("button", { name: "Buat Skenario" }),
      ).toBeDisabled();

      ControlledFileReader.instances[1].complete("data:image/png;base64,two");
      ControlledFileReader.instances[0].complete(
        "data:application/pdf;base64,one",
      );
      await waitFor(() => expect(wizardSave).not.toBeDisabled());
      await user.click(wizardSave);
      await user.click(
        screen.getByRole("button", { name: "Simpan Perubahan" }),
      );

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          scenarios: expect.arrayContaining([
            expect.objectContaining({
              attachmentImages: [
                "data:image/png;base64,two",
                "data:application/pdf;base64,one",
              ],
            }),
          ]),
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ignores a late attachment completion after cancel and reopen", async () => {
    class ControlledFileReader {
      static instances: ControlledFileReader[] = [];
      result: string | null = null;
      onloadend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        ControlledFileReader.instances.push(this);
      }

      complete(result: string) {
        this.result = result;
        this.onloadend?.();
      }
    }

    vi.stubGlobal("FileReader", ControlledFileReader);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      const user = userEvent.setup();
      renderModal();
      await user.click(
        screen.getByRole("button", { name: /tambah skenario baru/i }),
      );
      await reachEmailStage(user);
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, {
        target: {
          files: [new File(["old"], "old.pdf", { type: "application/pdf" })],
        },
      });
      expect(ControlledFileReader.instances).toHaveLength(1);

      await user.click(
        screen.getByRole("button", { name: "Tutup wizard skenario" }),
      );
      await user.click(
        screen.getByRole("button", { name: /tambah skenario baru/i }),
      );
      await reachEmailStage(user);
      ControlledFileReader.instances[0].complete(
        "data:application/pdf;base64,old",
      );

      expect(
        screen.queryByRole("button", { name: "Hapus lampiran 1" }),
      ).toBeNull();
      expect(confirm).toHaveBeenCalledWith(
        "Perubahan belum disimpan. Yakin ingin keluar?",
      );
    } finally {
      vi.unstubAllGlobals();
      confirm.mockRestore();
    }
  });

  it("rejects non-string and error FileReader results without attachments", async () => {
    class ControlledFileReader {
      static instances: ControlledFileReader[] = [];
      result: string | ArrayBuffer | null = null;
      onloadend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        ControlledFileReader.instances.push(this);
      }

      complete(result: string | ArrayBuffer | null) {
        this.result = result;
        this.onloadend?.();
      }

      fail() {
        this.onerror?.();
        this.onloadend?.();
      }
    }

    vi.stubGlobal("FileReader", ControlledFileReader);
    try {
      const user = userEvent.setup();
      renderModal();
      await user.click(
        screen.getByRole("button", { name: /tambah skenario baru/i }),
      );
      await reachEmailStage(user);
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, {
        target: {
          files: [new File(["bad"], "bad.pdf", { type: "application/pdf" })],
        },
      });
      ControlledFileReader.instances[0].complete(new ArrayBuffer(1));
      expect(
        screen.queryByRole("button", { name: "Hapus lampiran 1" }),
      ).toBeNull();

      fireEvent.change(input, {
        target: {
          files: [
            new File(["error"], "error.pdf", { type: "application/pdf" }),
          ],
        },
      });
      vi.mocked(notify.error).mockClear();
      ControlledFileReader.instances[1].fail();
      expect(notify.error).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole("button", { name: "Hapus lampiran 1" }),
      ).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the modal retryable and prevents duplicate settings saves", async () => {
    let rejectSave!: (error: Error) => void;
    const savePromise = new Promise<void>((_, reject) => {
      rejectSave = reject;
    });
    const onSave = vi.fn().mockReturnValue(savePromise);
    const user = userEvent.setup();
    renderModal({ onSave });

    const saveButton = screen.getByRole("button", {
      name: /simpan perubahan/i,
    });
    await user.click(saveButton);
    expect(saveButton).toBeDisabled();
    await user.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);

    rejectSave(new Error("network failure"));
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    expect(screen.getByText("Pengaturan Simulasi")).toBeDefined();
  });

  it("keeps reset confirmation and uses the exact dirty confirmation for wizard close", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderModal();
    await user.click(screen.getByRole("button", { name: /reset default/i }));
    expect(confirm).toHaveBeenCalledWith(
      "Apakah Anda yakin ingin mereset semua pengaturan (skenario & karakteristik) ke awal? Data yang Anda buat akan hilang.",
    );
  });

  it("shows changed-elsewhere guidance for a settings conflict and retains the modal", async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn()
      .mockRejectedValue(new ApiError("SETTINGS_CONFLICT", "stale settings"));
    renderModal({ onSave });

    await user.click(screen.getByRole("button", { name: /simpan perubahan/i }));
    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        expect.stringContaining("diubah di tempat lain"),
      ),
    );
    expect(screen.getByText("Pengaturan Simulasi")).toBeDefined();
  });

  it("preserves the visible draft when reset persistence is rejected", async () => {
    let rejectSave!: (error: Error) => void;
    const onSave = vi.fn().mockReturnValue(
      new Promise<void>((_, reject) => {
        rejectSave = reject;
      }),
    );
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderModal({ onSave });

    await user.click(screen.getByRole("button", { name: "Identitas" }));
    const sender = screen.getByLabelText(/Nama Pengirim \(Header\)/);
    await user.clear(sender);
    await user.type(sender, "Draft yang harus dipertahankan");
    await user.click(screen.getByRole("button", { name: /reset default/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(
      screen.getByDisplayValue("Draft yang harus dipertahankan"),
    ).toBeDefined();

    rejectSave(new Error("network failure"));
    await waitFor(() =>
      expect(
        screen.getByDisplayValue("Draft yang harus dipertahankan"),
      ).toBeDefined(),
    );
    expect(screen.getByText("Pengaturan Simulasi")).toBeDefined();
    confirm.mockRestore();
  });

  it("scopes wizard cancel to wizard changes and preserves unrelated modal edits", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderModal();
    await user.click(screen.getByRole("button", { name: "Identitas" }));
    const sender = screen.getByLabelText(/Nama Pengirim \(Header\)/);
    await user.clear(sender);
    await user.type(sender, "Edit sebelum wizard");
    await user.click(screen.getByRole("button", { name: "Masalah" }));
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await user.type(
      screen.getByPlaceholderText("Contoh: Kesalahan Transaksi Real-time"),
      "Wizard change",
    );
    await user.click(screen.getByRole("button", { name: "Batal" }));
    expect(confirm).toHaveBeenCalledWith(
      "Perubahan belum disimpan. Yakin ingin keluar?",
    );
    await user.click(screen.getByRole("button", { name: "Identitas" }));
    expect(screen.getByDisplayValue("Edit sebelum wizard")).toBeDefined();
  });

  it("does not confirm when a pristine add wizard follows an edited wizard", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderModal();

    await user.click(screen.getByTitle("Edit"));
    await user.click(screen.getByRole("button", { name: "Batal" }));
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Tutup wizard skenario" }),
    );

    expect(confirm).not.toHaveBeenCalled();
  });

  it("uses the exact dirty confirmation for wizard close", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onClose } = renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await user.type(
      screen.getByPlaceholderText("Contoh: Kesalahan Transaksi Real-time"),
      "Dirty",
    );
    await user.click(
      screen.getByRole("button", { name: "Tutup wizard skenario" }),
    );
    expect(confirm).toHaveBeenCalledWith(
      "Perubahan belum disimpan. Yakin ingin keluar?",
    );
    expect(onClose).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await user.click(
      screen.getByRole("button", { name: "Tutup wizard skenario" }),
    );
    expect(screen.getByText("Pengaturan Simulasi")).toBeDefined();
  });
});
