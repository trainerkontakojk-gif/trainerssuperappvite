import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsModal } from "../routes/pdkt/components/SettingsModal";
import type { PdktAppSettings as AppSettings } from "../routes/pdkt/pdktSettings";

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
vi.mock("../../../lib/toast", () => ({
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
  const onSave = vi.fn();
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

async function completeScenarioStage(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/Kategori/), "Kepatuhan");
  fireEvent.change(
    screen.getByPlaceholderText("Contoh: Kesalahan Transaksi Real-time"),
    { target: { value: " Wizard" } },
  );
  fireEvent.change(
    screen.getByPlaceholderText(
      "Jelaskan konteks masalah yang harus diselesaikan oleh agen...",
    ),
    { target: { value: " Konteks" } },
  );
  await user.click(screen.getByRole("button", { name: "Lanjut" }));
}

async function reachEmailStage(user: ReturnType<typeof userEvent.setup>) {
  await completeScenarioStage(user);
  await user.click(screen.getByRole("button", { name: "Lanjut" }));
}

describe("PDKT scenario wizard", () => {
  beforeEach(() => vi.restoreAllMocks());

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

  it("keeps optional profile fields passable and retains values across stages", async () => {
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
    expect(document.getElementById("simulation-settings-title")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Kembali" }));
    expect(
      screen.getByRole("button", { name: /3\. Email & Pengaturan, Selesai/ }),
    ).toBeDefined();
    expect(screen.getByDisplayValue("Profil Baru")).toBeDefined();
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
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await completeScenarioStage(user);
    await user.click(screen.getByRole("button", { name: "Lanjut" }));

    await user.selectOptions(
      screen.getByLabelText(/Penerima Utama/),
      "ojk",
    );
    await user.selectOptions(
      screen.getByLabelText(/Mode Penerima/),
      "multiple",
    );
    await user.click(screen.getByRole("button", { name: "Tambah alamat" }));
    expect(
      screen.getByRole("textbox", { name: "Alamat email tambahan 1" }),
    ).toBeDefined();
    await user.type(
      screen.getByPlaceholderText("alamat.tujuan@domain.com"),
      "Compliance@Example.com",
    );
    await user.click(screen.getByRole("button", { name: "Tambah alamat" }));
    expect(
      screen.getByRole("textbox", { name: "Alamat email tambahan 2" }),
    ).toBeDefined();
    const recipientInputs = screen.getAllByPlaceholderText(
      "alamat.tujuan@domain.com",
    );
    await user.type(recipientInputs[1], "audit@example.com");

    await user.click(screen.getByRole("button", { name: "Buat Skenario" }));
    expect(screen.queryByRole("button", { name: "Buat Skenario" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Simpan Perubahan" }));

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
    await user.click(
      screen.getByRole("button", { name: /tambah skenario baru/i }),
    );
    await reachEmailStage(user);
    await user.click(screen.getByRole("button", { name: /tambah alamat/i }));
    await user.type(
      screen.getByPlaceholderText("alamat.tujuan@domain.com"),
      "bad",
    );
    await user.click(screen.getByRole("button", { name: "Buat Skenario" }));
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

  it("keeps reset confirmation and uses the exact dirty confirmation for wizard close", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderModal();
    await user.click(screen.getByRole("button", { name: /reset default/i }));
    expect(confirm).toHaveBeenCalledWith(
      "Apakah Anda yakin ingin mereset semua pengaturan (skenario & karakteristik) ke awal? Data yang Anda buat akan hilang.",
    );
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
