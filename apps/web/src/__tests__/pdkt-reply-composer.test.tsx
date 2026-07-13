import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplyComposer } from "../routes/pdkt/components/ReplyComposer";

const baseProps = {
  recipient: "same@example.com",
  subject: "Re: Same subject",
  onSend: vi.fn(),
  onClose: vi.fn(),
  isLoading: false,
};

describe("ReplyComposer draft identity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps drafts for identical recipient and subject separate by mailbox ID", () => {
    const { unmount } = render(
      <ReplyComposer {...baseProps} mailboxId="mailbox-a" />,
    );
    fireEvent.change(screen.getByPlaceholderText("Tulis balasan Anda..."), {
      target: { value: "Draft A" },
    });
    vi.advanceTimersByTime(500);
    unmount();

    render(<ReplyComposer {...baseProps} mailboxId="mailbox-b" />);
    expect(screen.getByPlaceholderText("Tulis balasan Anda...")).toHaveValue(
      "",
    );
    fireEvent.change(screen.getByPlaceholderText("Tulis balasan Anda..."), {
      target: { value: "Draft B" },
    });
    vi.advanceTimersByTime(500);

    expect(localStorage.getItem("pdkt_draft_mailbox-a")).toBe("Draft A");
    expect(localStorage.getItem("pdkt_draft_mailbox-b")).toBe("Draft B");
  });

  it("loads a fresh draft when the caller remounts for another mailbox", () => {
    localStorage.setItem("pdkt_draft_mailbox-a", "Draft A");
    const { rerender } = render(
      <ReplyComposer {...baseProps} mailboxId="mailbox-a" key="mailbox-a" />,
    );
    expect(screen.getByPlaceholderText("Tulis balasan Anda...")).toHaveValue(
      "Draft A",
    );

    rerender(
      <ReplyComposer {...baseProps} mailboxId="mailbox-b" key="mailbox-b" />,
    );
    expect(screen.getByPlaceholderText("Tulis balasan Anda...")).toHaveValue(
      "",
    );
  });

  it("saves the active mailbox draft on close and removes it after send", () => {
    const onSend = vi.fn();
    render(
      <ReplyComposer {...baseProps} mailboxId="mailbox-a" onSend={onSend} />,
    );
    const textarea = screen.getByPlaceholderText("Tulis balasan Anda...");
    fireEvent.change(textarea, { target: { value: "Draft A" } });
    fireEvent.click(screen.getByRole("button", { name: "Tutup form balasan" }));
    expect(localStorage.getItem("pdkt_draft_mailbox-a")).toBe("Draft A");

    fireEvent.change(textarea, { target: { value: "Final A" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    expect(onSend).toHaveBeenCalledWith("Final A");
    expect(localStorage.getItem("pdkt_draft_mailbox-a")).toBeNull();
  });
});
