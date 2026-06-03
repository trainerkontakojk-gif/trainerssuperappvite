import { describe, it, expect, vi } from "vitest";
import * as pdktService from "../services/pdkt-service";
import { renderPdktConsumerName } from "../services/pdkt-template-resolver";

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: vi.fn(),
}));

vi.mock("../lib/openrouter", () => ({
  generateOpenRouterContent: vi.fn(),
}));

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
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
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
      or: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null }),
    };
    const items = await pdktService.fetchMailboxItems(
      mockSupabase as unknown as Parameters<typeof pdktService.fetchMailboxItems>[0],
      "user1",
    );
    expect(items).toHaveLength(1);
    expect(mockSupabase.from).toHaveBeenCalledWith("pdkt_mailbox_items");
    expect(mockSupabase.limit).toHaveBeenCalledWith(100);
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
    } as unknown as Parameters<typeof pdktService.createMailboxItem>[1];
    const id = await pdktService.createMailboxItem(
      mockSupabase as unknown as Parameters<typeof pdktService.createMailboxItem>[0],
      payload,
    );
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

      expect(renderPdktConsumerName(body, identity, "upfront")).toMatch(
        /atas nama Budi|administratif.*Budi|pengaduan.*Budi/i,
      );
      expect(renderPdktConsumerName(body, identity, "late")).toMatch(
        /atas nama Budi|laporan.*Budi|akun.*Budi/i,
      );
      expect(renderPdktConsumerName(body, identity, "none")).not.toContain(
        "Budi",
      );
    });

    it("replaces consumer aliases in bracket placeholders", () => {
      const identity = {
        name: "Budi",
        email: "b@b.com",
        city: "Jakarta",
        bodyName: "Budi",
      };

      const rendered = renderPdktConsumerName(
        "Saya [Nama Nasabah] menulis ini.",
        identity,
        "upfront",
      );

      expect(rendered).toContain("Budi");
    });

    it("ensures consumer aliases are omitted in bracket placeholders for none pattern", () => {
      const identity = {
        name: "Budi",
        email: "b@b.com",
        city: "Jakarta",
        bodyName: "Budi",
      };

      const rendered = renderPdktConsumerName(
        "Saya [Nama Nasabah] menulis ini.",
        identity,
        "none",
      );

      expect(rendered).not.toContain("Budi");
    });

    it("fails closed when template generation keeps violating policy after retry", async () => {
      const { generateGeminiContent } = await import("../lib/gemini");
      vi.mocked(generateGeminiContent).mockResolvedValue({
        success: true,
        text: JSON.stringify({
          subject: "Halo Budi",
          body: `${"keluhan ".repeat(520)}Sebagai AI saya akan menjelaskan skenario ini kepada user.`,
        }),
      } as any);

      const testIdentity = {
        name: "Budi",
        email: "b@b.com",
        city: "Jakarta",
        bodyName: "Budi",
      };

      const scenario = {
        id: "test-scenario",
        category: "Test",
        title: "Test Scenario",
        description: "Description",
        isActive: true,
        isLicensed: true,
      };
      const config = {
        scenarios: [scenario],
        consumerType: {
          id: "c1",
          name: "Normal",
          description: "Normal",
        },
        identity: testIdentity,
        enableImageGeneration: false,
        selectedModel: "gemini-3.1-flash-lite",
        resolvedConsumerNameMentionPattern: "none",
        writingStyleMode: "realistic",
      } as any;

      const result = await pdktService.generateScenarioEmailTemplate(
        scenario as any,
        config,
        undefined,
        "user-1",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("melanggar");
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
  const sharedMailboxMigrationSql = () =>
    readFileSync(
      join(
        process.cwd(),
        "../../supabase/migrations/20260603090000_pdkt_shared_mailbox_policy.sql",
      ),
      "utf8",
    );
  const sharedMailboxRollbackSql = () =>
    readFileSync(
      join(
        process.cwd(),
        "../../supabase/rollbacks/rollback_20260603090000_pdkt_shared_mailbox_policy.sql",
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

  it("returns the inserted canonical mailbox id from the shared mailbox migration", () => {
    const migration = sharedMailboxMigrationSql();
    expect(migration).toContain("v_source_item_id UUID");
    expect(migration).toContain("RETURNING id INTO v_source_item_id");
    expect(migration).toContain("RETURN v_source_item_id");
  });

  it("documents a DB rollback for the shared mailbox migration", () => {
    const rollback = sharedMailboxRollbackSql();
    expect(rollback).toContain('DROP POLICY IF EXISTS "pdkt_mailbox_select_all"');
    expect(rollback).toContain('CREATE POLICY "pdkt_mailbox_select_own"');
    expect(rollback).toContain("AND user_id = v_creator_id");
    expect(rollback).toContain("AND user_id = v_user_id");
    expect(rollback).toContain("DROP FUNCTION IF EXISTS public.soft_delete_pdkt_mailbox_item(UUID)");
  });
});
