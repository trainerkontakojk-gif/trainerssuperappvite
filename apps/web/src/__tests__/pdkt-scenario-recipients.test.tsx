import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScenarioRecipientsField } from "../routes/pdkt/components/settings/scenarios/ScenarioRecipientsField";
import type { PdktScenario } from "@trainers/types";

describe("PDKT scenario recipient editor", () => {
  it("adds, removes, and saves per-scenario recipient targets", async () => {
    const user = userEvent.setup();
    const onSaveMock = vi.fn();

    function TestHarness() {
      const [draft, setDraft] = useState<Partial<PdktScenario>>({
        recipientMode: "single",
        recipientEmails: [],
      });

      return (
        <div>
          <ScenarioRecipientsField
            draft={draft}
            onDraftChange={(updates) =>
              setDraft((prev) => ({ ...prev, ...updates }))
            }
          />
          <button type="button" onClick={() => onSaveMock(draft)}>
            Commit
          </button>
        </div>
      );
    }

    render(<TestHarness />);

    const primaryRecipient = screen.getByLabelText(/Lawan Bicara Utama/);
    expect(primaryRecipient).toHaveValue("ojk");
    await user.selectOptions(primaryRecipient, "reported_company");
    expect(primaryRecipient).toHaveValue("reported_company");
    await user.selectOptions(primaryRecipient, "ojk");
    expect(screen.queryByLabelText(/Mode Penerima/)).toBeNull();
    expect(screen.getByText("konsumen@ojk.go.id")).toBeDefined();
    expect(screen.getByText("Disertakan otomatis.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: /tambah email/i }));
    await user.click(screen.getByRole("button", { name: /tambah email/i }));

    const recipientInputs = screen.getAllByPlaceholderText(
      "email.tambahan@domain.com",
    );
    await user.type(recipientInputs[0], "alpha@test.com");
    await user.type(recipientInputs[1], "beta@test.com");

    await user.click(screen.getByRole("button", { name: /hapus email 2/i }));
    expect(screen.queryByDisplayValue("beta@test.com")).toBeNull();

    await user.click(screen.getByRole("button", { name: /commit/i }));

    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryRecipientType: "ojk",
        recipientMode: "multiple",
        recipientEmails: ["alpha@test.com"],
      }),
    );
  });
});
