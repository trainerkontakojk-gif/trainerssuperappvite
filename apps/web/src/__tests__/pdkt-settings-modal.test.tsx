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

async function selectAiModeIfNeeded(user: ReturnType<typeof userEvent.setup>) {
  const modeButton = screen.queryByRole("button", { name: /^Skenario AI/ });
  if (modeButton) await user.click(modeButton);
}

async function completeScenarioStage(
  user: ReturnType<typeof userEvent.setup>,
  title = " Wizard",
) {
  await selectAiModeIfNeeded(user);
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

describe("PDKT scenario wizard", { timeout: 30_000 }, () => {
  it("shows the Gemini/OpenAI-only model registry in the system tab", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("tab", { name: "Sistem" }));

    [
      "Gemini 3.8 Flash",
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
  });

  it("asks for a creation mode before opening the scenario wizard", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );

    expect(screen.getByText("Pilih cara menyiapkan skenario")).toBeDefined();
    expect(screen.getByRole("button", { name: /skenario ai/i })).toBeDefined();
    expect(
      screen.getByRole("button", { name: /email buatan sendiri/i }),
    ).toBeDefined();
    expect(screen.queryByText("1. Skenario")).toBeNull();

    await user.click(screen.getByRole("button", { name: /skenario ai/i }));
    expect(screen.getByText("1. Skenario AI")).toBeDefined();
    expect(screen.getByText(/email akan dibuat oleh ai/i)).toBeDefined();
    expect(
      screen.queryByRole("textbox", { name: "Isi email buatan sendiri" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Batal" }));
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /email buatan sendiri/i }),
    );
    expect(
      screen.getByRole("textbox", { name: /Isi email buatan sendiri/ }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Generate" })).toBeNull();
  });

  it("reopens manual scenarios directly in the manual flow", async () => {
    const user = userEvent.setup();
    renderModal({
      settings: {
        ...initialSettings,
        scenarios: [
          {
            ...initialSettings.scenarios[0],
            alwaysUseSampleEmail: true,
            sampleEmailTemplate: {
              subject: "Kendala transaksi",
              body: "Saya ingin menyampaikan kendala transaksi ini.",
            },
          },
        ],
      },
    });

    await user.click(screen.getByTitle("Edit"));

    expect(screen.queryByText("Pilih cara menyiapkan skenario")).toBeNull();
    expect(
      screen.getByRole("textbox", { name: /Isi email buatan sendiri/ }),
    ).toHaveValue("Saya ingin menyampaikan kendala transaksi ini.");
    expect(screen.queryByRole("button", { name: "Generate" })).toBeNull();
  });

  it("uses the scenario save label while editing an existing scenario", async () => {
    const user = userEvent.setup();
    renderModal({
      settings: {
        ...initialSettings,
        scenarios: [
          {
            ...initialSettings.scenarios[0],
            alwaysUseSampleEmail: true,
            sampleEmailTemplate: {
              subject: "Kendala transaksi",
              body: "Saya ingin menyampaikan kendala transaksi ini.",
            },
          },
        ],
      },
    });

    await user.click(screen.getByTitle("Edit"));
    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    await user.click(screen.getByRole("button", { name: "Lanjut" }));

    expect(
      screen.getByRole("button", { name: "Simpan Skenario" }),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Simpan Perubahan" }),
    ).toBeNull();
  });

  it("saves and reloads the optional evaluation-only expected answer", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await user.click(screen.getByRole("button", { name: /skenario ai/i }));
    await user.selectOptions(screen.getByLabelText(/Kategori/), "Kepatuhan");
    fireEvent.change(
      screen.getByPlaceholderText("Contoh: Kesalahan Transaksi Real-time"),
      { target: { value: "Jawaban Referensi" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "Jelaskan konteks masalah yang harus diselesaikan oleh agen...",
      ),
      { target: { value: "Konteks skenario." } },
    );

    const expectedAnswer = "Berikan nomor laporan dan estimasi tindak lanjut.";
    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    await user.click(screen.getByRole("button", { name: "Lanjut" }));

    expect(
      screen.getByText(/hanya digunakan sebagai referensi evaluasi/i),
    ).toBeDefined();
    const expectedAnswerField = screen.getByLabelText(
      /Jawaban yang Diharapkan/,
    );
    expect(expectedAnswerField.closest("#scenario-step-email")).not.toBeNull();
    fireEvent.change(expectedAnswerField, {
      target: { value: expectedAnswer },
    });

    expect(screen.getByLabelText(/Lawan Bicara Utama/)).toHaveValue("ojk");
    await user.click(screen.getByRole("button", { name: "Buat Skenario" }));
    await user.click(screen.getByRole("button", { name: "Simpan Perubahan" }));

    expect(onSave.mock.calls[0][0].scenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Jawaban Referensi",
          primaryRecipientType: "ojk",
          expectedAnswer,
        }),
      ]),
    );
  });

  it("loads an existing expected answer into the scenario editor", async () => {
    const user = userEvent.setup();
    renderModal({
      settings: {
        ...initialSettings,
        scenarios: [
          {
            ...initialSettings.scenarios[0],
            expectedAnswer: "Sampaikan nomor laporan kepada konsumen.",
          },
        ],
      },
    });

    await user.click(screen.getByTitle("Edit"));

    expect(screen.getByLabelText(/Jawaban yang Diharapkan/)).toHaveValue(
      "Sampaikan nomor laporan kepada konsumen.",
    );
  });

  it("saves a manually authored email without invoking the AI generator", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /email buatan sendiri/i }),
    );
    await user.selectOptions(screen.getByLabelText(/Kategori/), "Kepatuhan");
    await user.type(
      screen.getByPlaceholderText("Contoh: Kesalahan Transaksi Real-time"),
      "Email Manual",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Isi email buatan sendiri/ }),
      "Saya ingin menyampaikan kendala transaksi ini.",
    );
    expect(screen.queryByRole("button", { name: "Generate" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    await user.click(screen.getByRole("button", { name: "Buat Skenario" }));
    await user.click(screen.getByRole("button", { name: /simpan perubahan/i }));

    const savedScenario = onSave.mock.calls[0][0].scenarios.at(-1);
    expect(savedScenario).toMatchObject({
      title: "Email Manual",
      description: "Saya ingin menyampaikan kendala transaksi ini.",
      alwaysUseSampleEmail: true,
      sampleEmailTemplate: {
        body: "Saya ingin menyampaikan kendala transaksi ini.",
      },
    });
  });

  it("renders the exact three-stage contract and disables invalid progress", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await selectAiModeIfNeeded(user);
    expect(screen.getByText("1. Skenario AI")).toBeDefined();
    expect(
      screen.getByText(
        "Jelaskan situasi yang akan dihadapi agent dalam simulasi email.",
        { exact: true },
      ),
    ).toBeDefined();
    expect(screen.getByText("2. Profil Pengirim")).toBeDefined();
    expect(screen.getByText("3. Penerima & Evaluasi")).toBeDefined();
    expect(screen.queryByText("3. Review & Pengaturan")).toBeNull();
    expect(screen.getByRole("button", { name: "Lanjut" })).toBeDisabled();
    expect(screen.getAllByText("Wajib").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Opsional").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Batal" })).toBeDefined();
  });

  it("keeps the active wizard panel scrollable on long profile steps", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await completeScenarioStage(user);

    const scenarioPanel = document.querySelector('[data-slot="tabs-content"]');
    expect(scenarioPanel).toHaveClass(
      "min-h-0",
      "flex",
      "flex-1",
      "flex-col",
      "overflow-hidden",
    );

    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(scenarioPanel).toHaveClass(
      "min-h-0",
      "flex",
      "flex-1",
      "flex-col",
      "overflow-hidden",
    );

    const wizardMain = document.querySelector("#scenario-form main");
    const wizardFooter = document.querySelector("#scenario-form footer");
    expect(wizardMain).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(wizardFooter).toHaveClass("shrink-0");

    expect(screen.getByText("Penerima Email")).toBeDefined();
    const additionalSettings = screen
      .getByText("Pengaturan tambahan")
      .closest("details");
    expect(additionalSettings).not.toBeNull();
    expect(additionalSettings).not.toHaveAttribute("open");
    await user.click(screen.getByText("Pengaturan tambahan"));
    expect(
      screen.getByRole("heading", { name: "Pengaturan Simulasi" }),
    ).toBeDefined();
    expect(screen.getByLabelText(/Model AI/)).toBeDefined();
    expect(wizardMain).toHaveClass("overflow-y-auto");
    expect(wizardFooter).toHaveClass("shrink-0");
  });

  it("shows and updates the scenario description character counter", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await selectAiModeIfNeeded(user);

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
    { timeout: 30_000 },
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
      const identitySection = screen
        .getByRole("heading", { name: "Identitas Pengirim" })
        .closest("section");
      const communicationSection = screen
        .getByRole("heading", { name: "Karakter dan Gaya Komunikasi" })
        .closest("section");
      expect(identitySection).toHaveClass(
        "grid",
        "grid-cols-1",
        "md:grid-cols-2",
      );
      expect(communicationSection).toHaveClass(
        "grid",
        "grid-cols-1",
        "md:grid-cols-2",
        "gap-4",
      );
      expect(
        screen.getByRole("heading", { name: "Karakter dan Gaya Komunikasi" })
          .parentElement,
      ).toHaveClass("pb-2");
      expect(
        identitySection?.querySelectorAll("input, select, textarea"),
      ).toHaveLength(4);
      expect(
        communicationSection?.querySelectorAll("input, select, textarea"),
      ).toHaveLength(2);
      await user.selectOptions(screen.getByLabelText(/Karakter aktif/), "c-1");
      expect(
        communicationSection?.querySelectorAll("input, select, textarea"),
      ).toHaveLength(6);
      expect(screen.getByText("Profil Pengirim")).toBeDefined();
      expect(screen.getByRole("button", { name: "Lanjut" })).not.toBeDisabled();
      await user.type(screen.getByLabelText(/Nama pengirim/), "Profil Baru");
      await user.click(screen.getByRole("button", { name: "Lanjut" }));
      expect(
        screen.getByRole("heading", { name: "Penerima & Evaluasi" }),
      ).toBeDefined();
      expect(
        document.getElementById("simulation-settings-title"),
      ).toBeDefined();
      await user.click(screen.getByRole("button", { name: "Kembali" }));
      expect(
        screen.getByRole("button", {
          name: /3\. Penerima & Evaluasi, Selesai/,
        }),
      ).toBeDefined();
      expect(screen.getByDisplayValue("Profil Baru")).toBeDefined();
    },
  );

  it(
    "isolates scenario identity from global identity and saves the override",
    { timeout: 30_000 },
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
    { timeout: 30_000 },
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
    await user.click(screen.getByRole("tab", { name: "Identitas" }));
    expect(screen.getByLabelText(/Nama Pengirim \(Header\)/)).toHaveValue(
      "Jane Doe",
    );
  });

  it("balances recipients against attachments and evaluation without an email preview", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await reachEmailStage(user);

    expect(screen.queryByText(/Pratinjau Email/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Buat (Pratinjau|Ulang)/i }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Penerima & Evaluasi" }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Penerima Email" }),
    ).toBeDefined();
    expect(screen.getByText("Email Tambahan")).toBeDefined();
    expect(screen.getByText("Lampiran (opsional)")).toBeDefined();
    expect(screen.getByText("Disertakan otomatis.")).toBeDefined();
    expect(screen.getByLabelText(/Lawan Bicara Utama/)).toBeDefined();
    expect(screen.queryByLabelText(/Mode Penerima/)).toBeNull();

    const recipientSection = document.getElementById(
      "scenario-recipient-targets",
    );
    const attachmentSection = document.getElementById("scenario-attachments");
    const expectedAnswer = screen.getByLabelText(/Jawaban yang Diharapkan/);
    const emailLayout = document.getElementById("scenario-email-content");
    expect(emailLayout).toHaveClass("min-w-0", "grid-cols-1", "lg:grid-cols-2");
    expect(document.getElementById("scenario-email-preview")).toBeNull();
    expect(recipientSection).not.toBeNull();
    expect(attachmentSection).not.toBeNull();
    const columns = Array.from(emailLayout!.children);
    expect(columns).toHaveLength(2);
    expect(columns[0]).toContainElement(recipientSection!);
    expect(columns[0]).not.toContainElement(attachmentSection!);
    expect(columns[1]).toContainElement(attachmentSection!);
    expect(columns[1]).toContainElement(expectedAnswer);
    expect(
      recipientSection!.compareDocumentPosition(attachmentSection!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      attachmentSection!.compareDocumentPosition(expectedAnswer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const additionalSettings = screen
      .getByText("Pengaturan tambahan")
      .closest("details");
    expect(additionalSettings).not.toBeNull();
    expect(additionalSettings).not.toHaveAttribute("open");
    await user.click(screen.getByText("Pengaturan tambahan"));
    expect(
      screen.getByRole("heading", { name: "Pengaturan Simulasi" }),
    ).toBeDefined();
    expect(screen.getByLabelText(/Buat gambar/)).toBeDefined();
    expect(screen.getByLabelText(/Model AI/)).toBeDefined();
    expect(screen.getByLabelText(/Gaya penulisan/)).toBeDefined();
    expect(screen.getByText("Pilih Gambar / PDF")).toBeDefined();
    expect(screen.queryByText("Konfigurasi Email")).toBeNull();
    expect(screen.queryByText("Pengaturan Lanjutan")).toBeNull();
    expect(screen.queryByTestId("advanced-summary")).toBeNull();
  });

  it("keeps manual email editing in step one without a stage-three preview", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /email buatan sendiri/i }),
    );
    await user.selectOptions(screen.getByLabelText(/Kategori/), "Kepatuhan");
    await user.type(
      screen.getByPlaceholderText("Contoh: Kesalahan Transaksi Real-time"),
      "Email Manual",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Isi email buatan sendiri/ }),
      "Isi email yang ditulis trainer.",
    );
    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    await user.click(screen.getByRole("button", { name: "Lanjut" }));

    expect(
      screen.getByRole("button", {
        name: /3\. Penerima & Evaluasi, Sedang diisi/,
      }),
    ).toBeDefined();
    expect(screen.queryByText(/Pratinjau Email/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Email" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Buat (Pratinjau|Ulang)/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: /Isi email buatan sendiri/ }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Penerima Email" }),
    ).toBeDefined();
    expect(screen.getByText("Lampiran (opsional)")).toBeDefined();
    expect(screen.getByLabelText(/Jawaban yang Diharapkan/)).toBeDefined();
    expect(document.getElementById("simulation-settings-title")).toBeDefined();
    expect(screen.getByLabelText(/Lawan Bicara Utama/)).toBeDefined();
    expect(screen.queryByLabelText(/Mode Penerima/)).toBeNull();
    expect(screen.getByText("Pilih Gambar / PDF")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Kembali" }));
    await user.click(screen.getByRole("button", { name: "Kembali" }));
    const manualEmailBody = screen.getByRole("textbox", {
      name: /Isi email buatan sendiri/,
    });
    expect(manualEmailBody).toHaveValue("Isi email yang ditulis trainer.");
    await user.clear(manualEmailBody);
    await user.type(manualEmailBody, "Email manual yang diperbarui.");
    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    await user.click(screen.getByRole("button", { name: "Buat Skenario" }));
    await user.click(screen.getByRole("button", { name: /Simpan Perubahan/ }));
    expect(onSave.mock.calls[0][0].scenarios.at(-1)).toMatchObject({
      sampleEmailTemplate: {
        body: "Email manual yang diperbarui.",
      },
    });
  }, 60_000);

  it("preserves normalized OJK recipients through the three-stage wizard and outer save", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();
    fireEvent.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await completeScenarioStage(user);
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

    fireEvent.change(screen.getByLabelText(/Lawan Bicara Utama/), {
      target: { value: "ojk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tambah Email" }));
    const firstRecipient = screen.getByRole("textbox", {
      name: "Email tambahan 1",
    });
    fireEvent.change(firstRecipient, {
      target: { value: "Compliance@Example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tambah Email" }));
    const secondRecipient = screen.getByRole("textbox", {
      name: "Email tambahan 2",
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

    await user.click(screen.getByRole("tab", { name: "Sistem" }));
    await user.click(screen.getByRole("radio", { name: /^Realistis/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /tambah email/i }));
    fireEvent.change(screen.getByPlaceholderText("email.tambahan@domain.com"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buat Skenario" }));
    expect(screen.getByText(/format email tidak valid/i)).toBeDefined();
    expect(
      screen.getByPlaceholderText("email.tambahan@domain.com"),
    ).toHaveAttribute("aria-invalid", "true");
  });

  it("focuses the first invalid recipient row on final save", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await reachEmailStage(user);
    await user.click(screen.getByRole("button", { name: /tambah email/i }));
    await user.click(screen.getByRole("button", { name: /tambah email/i }));

    const recipientInputs = screen.getAllByPlaceholderText(
      "email.tambahan@domain.com",
    );
    fireEvent.change(recipientInputs[0], {
      target: { value: "valid@example.com" },
    });
    fireEvent.change(recipientInputs[1], { target: { value: "bad" } });

    await user.click(screen.getByRole("button", { name: "Buat Skenario" }));

    expect(screen.getByText(/format email tidak valid/i)).toBeDefined();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Email tambahan 2" }),
      ),
    );
    expect(
      screen.getByRole("textbox", { name: "Email tambahan 1" }),
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
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Hapus lampiran 1" }),
        ).toBeDefined(),
      { timeout: 15_000 },
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

    await user.click(screen.getByRole("tab", { name: "Identitas" }));
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
    await user.click(screen.getByRole("tab", { name: "Identitas" }));
    const sender = screen.getByLabelText(/Nama Pengirim \(Header\)/);
    await user.clear(sender);
    await user.type(sender, "Edit sebelum wizard");
    await user.click(screen.getByRole("tab", { name: "Masalah" }));
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await selectAiModeIfNeeded(user);
    await user.type(
      screen.getByPlaceholderText("Contoh: Kesalahan Transaksi Real-time"),
      "Wizard change",
    );
    await user.click(screen.getByRole("button", { name: "Batal" }));
    expect(confirm).toHaveBeenCalledWith(
      "Perubahan belum disimpan. Yakin ingin keluar?",
    );
    await user.click(screen.getByRole("tab", { name: "Identitas" }));
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
    await selectAiModeIfNeeded(user);
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
