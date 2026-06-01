import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmailDetailPane } from "../routes/pdkt/components/EmailDetailPane";
import type { PdktMailboxItem } from "@trainers/types";

describe("PDKT AI Image Rendering", () => {
  const mockItem: PdktMailboxItem = {
    id: "1",
    user_id: "u1",
    status: "open",
    created_at: new Date().toISOString(),
    sender_name: "Budi",
    sender_email: "budi@mail.com",
    subject: "Test Subject",
    snippet: "Test body",
    scenario_snapshot: {} as any,
    config_snapshot: {} as any,
    inbound_email: {
      id: "m1",
      from: "budi@mail.com",
      to: "ojk@mail.com",
      subject: "Test Subject",
      body: "Test body content",
      timestamp: new Date().toISOString(),
      isAgent: false,
      attachments: ["data:image/png;base64,ai-generated-image"],
      attachmentSource: "ai",
    },
    emails_thread: [],
    last_activity_at: new Date().toISOString(),
  };

  it("should render AI generated attachments correctly", () => {
    render(
      <EmailDetailPane
        item={mockItem}
        onReply={() => {}}
        onDelete={() => {}}
        evaluation={null}
        evaluationStatus={null}
        evaluationError={null}
        onRetryEval={() => {}}
      />
    );

    // Should show "Lampiran (1)"
    expect(screen.getByText(/Lampiran \(1\)/i)).toBeDefined();

    // Should have an image with specific src
    const img = screen.getByAltText(/Attachment 1/i) as HTMLImageElement;
    expect(img.src).toContain("data:image/png;base64,ai-generated-image");
  });

  it("does not render provider diagnostics as a consumer email warning", () => {
    const itemWithDiagnostics: PdktMailboxItem = {
      ...mockItem,
      inbound_email: {
        ...mockItem.inbound_email,
        attachments: [],
        attachmentSource: "none",
        attachmentWarning: "Model tidak mengembalikan gambar valid.",
        attachmentDiagnostics: {
          source: "none",
          status: "failed",
          reason: "empty-output",
          message: "Model tidak mengembalikan gambar valid.",
        },
      } as any,
    };

    render(
      <EmailDetailPane
        item={itemWithDiagnostics}
        onReply={() => {}}
        onDelete={() => {}}
        evaluation={null}
        evaluationStatus={null}
        evaluationError={null}
        onRetryEval={() => {}}
      />
    );

    expect(screen.queryByText(/Peringatan Lampiran AI/i)).toBeNull();
    expect(screen.queryByText(/Model tidak mengembalikan gambar valid./i)).toBeNull();
    expect(screen.queryByText(/Lampiran \(/i)).toBeNull();
  });
});
