import { describe, it, expect, vi } from "vitest";
import * as pdktService from "../services/pdkt-service";
import { renderPdktConsumerName } from "../services/pdkt-template-resolver";

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({
        data: { id: "1", user_id: "user1", config: {}, emails: [] },
        error: null,
      }),
    update: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    select_inner: vi.fn().mockReturnThis(),
  }),
  supabaseAdmin: {
    rpc: vi.fn().mockResolvedValue({ data: "history1", error: null }),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
}));

describe("PDKT Service", () => {
  it("should fetch mailbox items", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null }),
    };
    const items = await pdktService.fetchMailboxItems(mockSupabase, "user1");
    expect(items).toHaveLength(1);
    expect(mockSupabase.from).toHaveBeenCalledWith("pdkt_mailbox_items");
  });

  it("should create mailbox item via RPC", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: "new-id", error: null }),
    };
    const payload = {
      sender_name: "Test",
      sender_email: "test@example.com",
      subject: "Hello",
      snippet: "Hi",
    };
    const id = await pdktService.createMailboxItem(mockSupabase, payload);
    expect(id).toBe("new-id");
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "submit_pdkt_mailbox_batch",
      expect.any(Object),
    );
  });

  describe("helpers", () => {
    it("normalizes leaked PDKT subjects to empty string", () => {
      expect(pdktService.normalizeSubject("Ada penipuan pinjol")).toBe("");
      expect(pdktService.normalizeSubject("Tanya status SLIK")).toBe("");
      expect(pdktService.normalizeSubject("Halo saya mau tanya")).toBe(
        "Halo saya mau tanya",
      );
    });

    it("parses fenced JSON returned by AI providers", () => {
      const fenced = '```json\n{"subject": "test", "body": "content"}\n```';
      const parsed = pdktService.parseJsonFromModelText(fenced);
      expect(parsed.subject).toBe("test");
    });

    it("adds realistic writing instruction only in realistic mode", () => {
      expect(pdktService.getRealisticWritingInstruction("realistic")).toContain(
        "GAYA PENULISAN REALISTIS",
      );
      expect(pdktService.getRealisticWritingInstruction("training")).toBe("");
    });

    it("renders template names according to the resolved mention pattern", () => {
      const identity = {
        name: "Budi",
        email: "b@b.com",
        city: "Jakarta",
        bodyName: "Budi",
      };
      const body = "Ini isi email.";

      expect(renderPdktConsumerName(body, identity, "upfront")).toContain(
        "Halo, saya Budi.",
      );
      expect(renderPdktConsumerName(body, identity, "late")).toContain(
        "Salam,\nBudi",
      );
      expect(renderPdktConsumerName(body, identity, "none")).not.toContain(
        "Budi",
      );
    });
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("PDKT mailbox SQL contract", () => {
  const sql = () =>
    readFileSync(
      join(
        process.cwd(),
        "../../supabase/migrations/005_carbon_copy_parity.sql",
      ),
      "utf8",
    );

  it("revokes public and anon execute access for mailbox batch RPC", () => {
    expect(sql()).toContain(
      "REVOKE EXECUTE ON FUNCTION public.submit_pdkt_mailbox_batch",
    );
    expect(sql()).toContain("FROM public, anon");
  });

  it("returns only the creator source row for duplicate mailbox requests", () => {
    expect(sql()).toContain("AND user_id = v_creator_id");
    expect(sql()).toContain("AND is_shared_copy = false");
  });

  it("uses the approved profile status expected by the legacy fanout RPC", () => {
    expect(sql()).toContain("p.status = 'approved'");
  });
});
