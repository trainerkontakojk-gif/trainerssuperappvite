import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@trainers/types";
import {
  KETIK_PROMPT_BUDGET,
  compactChatHistory,
  computeAvailableHistoryBudget,
  buildKetikTurnPrompt,
  serializeKetikPromptData,
} from "../services/ketik/prompt-policy";

function makeMessage(
  id: string,
  sender: "agent" | "consumer" | "system",
  text: string,
): ChatMessage {
  return {
    id,
    sender,
    text,
    timestamp: new Date().toISOString(),
  };
}

describe("compactChatHistory", () => {
  describe("no-op under budget", () => {
    it("returns the full history unchanged when serialized size is under budget", () => {
      const history: ChatMessage[] = [
        makeMessage("1", "agent", "Halo"),
        makeMessage("2", "consumer", "Halo juga"),
        makeMessage("3", "agent", "Ada yang bisa dibantu?"),
      ];

      const result = compactChatHistory(history);

      expect(result.compacted).toEqual(history);
      expect(result.omittedCount).toBe(0);
    });

    it("returns empty history unchanged", () => {
      const result = compactChatHistory([]);

      expect(result.compacted).toEqual([]);
      expect(result.omittedCount).toBe(0);
    });

    it("returns single-message history unchanged", () => {
      const history: ChatMessage[] = [
        makeMessage("1", "agent", "Pesan tunggal"),
      ];

      const result = compactChatHistory(history);

      expect(result.compacted).toEqual(history);
      expect(result.omittedCount).toBe(0);
    });
  });

  describe("omission over budget", () => {
    it("omits oldest whole messages when serialized size exceeds budget", () => {
      const history: ChatMessage[] = [
        makeMessage("old-1", "agent", "A"),
        makeMessage("old-2", "consumer", "B"),
        makeMessage("keep-1", "agent", "C"),
      ];

      // Budget just enough for the last message alone
      const justForLast = JSON.stringify([
        { sender: "agent", text: "C" },
      ]).length;

      const result = compactChatHistory(history, justForLast);

      expect(result.compacted).toEqual([history[2]]);
      expect(result.omittedCount).toBe(2);
    });

    it("omits multiple oldest messages when budget is very tight", () => {
      const history: ChatMessage[] = [
        makeMessage("1", "agent", "X".repeat(1000)),
        makeMessage("2", "consumer", "Y".repeat(1000)),
        makeMessage("3", "agent", "Z".repeat(1000)),
        makeMessage("4", "consumer", "Latest"),
      ];

      // Budget only fits the last message
      const justForLatest = JSON.stringify([
        { sender: "consumer", text: "Latest" },
      ]).length;

      const result = compactChatHistory(history, justForLatest);

      expect(result.compacted).toEqual([history[3]]);
      expect(result.omittedCount).toBe(3);
    });
  });

  describe("latest full message preserved", () => {
    it("always keeps the latest message even when it alone exceeds budget", () => {
      const longText = "X".repeat(10_000);
      const history: ChatMessage[] = [
        makeMessage("1", "agent", "short"),
        makeMessage("2", "consumer", longText),
      ];

      const veryTight = JSON.stringify([
        { sender: "consumer", text: longText },
      ]).length;

      const result = compactChatHistory(history, veryTight);

      // Latest message is preserved even though it's large
      expect(result.compacted).toContainEqual(history[1]);
      expect(result.omittedCount).toBe(1);
    });

    it("preserves latest when it is the only message within budget", () => {
      const history: ChatMessage[] = [
        makeMessage("1", "agent", "A".repeat(500)),
        makeMessage("2", "consumer", "B".repeat(500)),
        makeMessage("3", "agent", "C"),
      ];

      const budgetForLastTwo = JSON.stringify([
        { sender: "agent", text: "C" },
      ]).length + 510; // fits latest + some

      const result = compactChatHistory(history, budgetForLastTwo);

      // Latest message must always be present
      expect(result.compacted[result.compacted.length - 1]).toEqual(history[2]);
    });
  });

  describe("chronological order", () => {
    it("maintains original message order after compaction", () => {
      const history: ChatMessage[] = [
        makeMessage("1", "agent", "X".repeat(2000)),
        makeMessage("2", "consumer", "Y".repeat(2000)),
        makeMessage("3", "agent", "Z".repeat(2000)),
        makeMessage("4", "consumer", "Last"),
      ];

      // Budget fits messages 3 and 4
      const costLastTwo = JSON.stringify([
        { sender: "agent", text: "Z".repeat(2000) },
        { sender: "consumer", text: "Last" },
      ]).length;

      const result = compactChatHistory(history, costLastTwo);

      expect(result.compacted.length).toBe(2);
      expect(result.compacted[0].id).toBe("3");
      expect(result.compacted[1].id).toBe("4");
    });
  });

  describe("input immutability", () => {
    it("does not mutate the original history array", () => {
      const original: ChatMessage[] = [
        makeMessage("1", "agent", "Hello"),
        makeMessage("2", "consumer", "World"),
      ];
      const frozen = structuredClone(original);

      compactChatHistory(original, 1);

      expect(original).toEqual(frozen);
    });
  });

  describe("default budget constant", () => {
    it("exports a named KETIK_PROMPT_BUDGET constant", () => {
      expect(KETIK_PROMPT_BUDGET).toBeGreaterThan(0);
      expect(typeof KETIK_PROMPT_BUDGET).toBe("number");
    });
  });
});

describe("computeAvailableHistoryBudget", () => {
  it("returns less than total budget when system instruction has non-zero length", () => {
    const sysInst = "A".repeat(500);
    const available = computeAvailableHistoryBudget(sysInst, "Test", 0);
    expect(available).toBeLessThan(KETIK_PROMPT_BUDGET);
    expect(available).toBeGreaterThan(0);
  });

  it("reduces available budget as system instruction grows", () => {
    const short = computeAvailableHistoryBudget("X".repeat(100), "Test", 0);
    const long = computeAvailableHistoryBudget("X".repeat(5000), "Test", 0);
    expect(long).toBeLessThan(short);
  });

  it("returns 0 when system instruction alone exceeds total budget", () => {
    const huge = "X".repeat(KETIK_PROMPT_BUDGET + 1);
    expect(computeAvailableHistoryBudget(huge, "Test", 0)).toBe(0);
  });

  it("accounts for variable scenarioTitle length in overhead reduction", () => {
    const sysInstLen = 1000;
    const shortTitle = computeAvailableHistoryBudget("X".repeat(sysInstLen), "", 0);
    const longTitle = computeAvailableHistoryBudget("X".repeat(sysInstLen), "Y".repeat(500), 0);
    // Longer scenarioTitle means larger overhead -> smaller budget
    expect(longTitle).toBeLessThan(shortTitle);
  });

  it("accounts for multi-digit omittedCount in overhead reduction", () => {
    const sysInstLen = 1000;
    const smallOmit = computeAvailableHistoryBudget("X".repeat(sysInstLen), "Test", 0);
    const largeOmit = computeAvailableHistoryBudget("X".repeat(sysInstLen), "Test", 999);
    // Larger omittedCount means more digits -> larger overhead -> smaller budget
    expect(largeOmit).toBeLessThan(smallOmit);
  });

  it("returns exact budget that guarantees total prompt <= KETIK_PROMPT_BUDGET", () => {
    const sysInst = "A".repeat(2000);
    const scenarioTitle = "Pinjol Ilegal";
    const omittedCount = 5;

    const budget = computeAvailableHistoryBudget(sysInst, scenarioTitle, omittedCount);

    // Build an empty-history turn prompt to verify the overhead accounting
    const emptyPrompt = buildKetikTurnPrompt({
      scenarioTitle,
      chatHistory: [],
      omittedCount,
    });
    const expectedOverhead = sysInst.length + (emptyPrompt.length - JSON.stringify([]).length);
    expect(budget).toBe(KETIK_PROMPT_BUDGET - expectedOverhead);
  });
});

describe("total assembled prompt stays within budget (integration)", () => {
  it("keeps total prompt under TOTAL_PROMPT_BUDGET when overhead is accounted", () => {
    // Build a realistic system instruction (~2000 chars)
    const systemInstruction = `
ROLEPLAY: Anda adalah KONSUMEN yang sedang menghubungi Kontak OJK 157 melalui chat. Anda bukan agen, bukan petugas, dan bukan AI.

<scenario_data>
${JSON.stringify({
  identity: { name: "Budi", city: "Jakarta", phone: "08123456789" },
  consumerType: { name: "Marah & Emosional", description: "Konsumen sedang sangat kesal.", difficulty: "Sulit" },
  scenario: { category: "Pinjol", title: "Pinjol Ilegal", description: "Konsumen diteror oleh pinjol ilegal.", script: null },
})}
</scenario_data>

ATURAN BALASAN:
1. Merespon secara natural, singkat, selayaknya chat WhatsApp.
2. Gunakan tag [BREAK] untuk memisahkan pesan.
3. Kembalikan [NO_RESPONSE] HANYA JIKA agen memberikan jawaban yang sangat memuaskan.
`.trim();

    const scenarioTitle = "Pinjol Ilegal";

    // Build a chat history that fits within the available budget
    const chatHistory: ChatMessage[] = [
      makeMessage("1", "agent", "Halo, ada yang bisa saya bantu?"),
      makeMessage("2", "consumer", "Ya, saya mau laporan pinjol ilegal."),
      makeMessage("3", "agent", "Baik, bisa dijelaskan detailnya?"),
    ];

    // Compute available budget for history using runtime scenarioTitle + conservative omittedCount
    const availableBudget = computeAvailableHistoryBudget(
      systemInstruction,
      scenarioTitle,
      chatHistory.length,
    );
    const { compacted } = compactChatHistory(chatHistory, availableBudget);

    // Build the actual turn prompt
    const prompt = buildKetikTurnPrompt({
      scenarioTitle,
      chatHistory: compacted,
      omittedCount: chatHistory.length - compacted.length,
    });

    // Total assembled prompt = system instruction + turn prompt
    const totalPrompt = systemInstruction.length + prompt.length;

    expect(totalPrompt).toBeLessThanOrEqual(KETIK_PROMPT_BUDGET);
  });

  it("keeps total prompt under budget with max-size messages in normal bounded case", () => {
    // Build a realistic system instruction (~2000 chars)
    const systemInstruction = "X".repeat(2000);
    const scenarioTitle = "Pinjol Ilegal";

    // Build a history with several messages near the 20K limit
    const chatHistory: ChatMessage[] = [
      makeMessage("1", "agent", "A".repeat(19000)),
      makeMessage("2", "consumer", "B".repeat(19000)),
      makeMessage("3", "agent", "C".repeat(19000)),
      makeMessage("4", "consumer", "D".repeat(19000)),
    ];

    // Compute available budget for history using runtime scenarioTitle + conservative omittedCount
    const availableBudget = computeAvailableHistoryBudget(
      systemInstruction,
      scenarioTitle,
      chatHistory.length,
    );

    const { compacted, omittedCount } = compactChatHistory(chatHistory, availableBudget);

    // Build the turn prompt
    const prompt = buildKetikTurnPrompt({
      scenarioTitle,
      chatHistory: compacted,
      omittedCount,
    });

    // Total assembled prompt = system instruction + turn prompt
    const totalPrompt = systemInstruction.length + prompt.length;

    expect(totalPrompt).toBeLessThanOrEqual(KETIK_PROMPT_BUDGET);
  });

  it("keeps total prompt under budget with long scenarioTitle and multi-digit omittedCount", () => {
    const systemInstruction = "X".repeat(2000);
    const scenarioTitle = "Laporan Konsumen Terhadap Praktik Pinjaman Online Ilegal yang Meresahkan Masyarakat " + "Y".repeat(450);

    // Build a large history with near-max messages that forces significant compaction
    const chatHistory: ChatMessage[] = [];
    for (let i = 0; i < 20; i++) {
      chatHistory.push(
        makeMessage(`msg-${i}`, i % 2 === 0 ? "agent" : "consumer", "A".repeat(19000)),
      );
    }

    // Compute budget with runtime scenario title and conservative count
    const availableBudget = computeAvailableHistoryBudget(
      systemInstruction,
      scenarioTitle,
      chatHistory.length,
    );
    const { compacted, omittedCount } = compactChatHistory(chatHistory, availableBudget);

    // Long scenarioTitle + near-max messages should force multi-digit omission
    expect(omittedCount).toBeGreaterThanOrEqual(10);

    // Build the turn prompt
    const prompt = buildKetikTurnPrompt({
      scenarioTitle,
      chatHistory: compacted,
      omittedCount,
    });

    const totalPrompt = systemInstruction.length + prompt.length;
    expect(totalPrompt).toBeLessThanOrEqual(KETIK_PROMPT_BUDGET);
  });

  it("keeps total prompt under budget when latest message barely fits residual budget", () => {
    const systemInstruction = "X".repeat(500);
    const scenarioTitle = "Test";

    // Build a budget where the overhead leaves just enough for one message
    const budget = computeAvailableHistoryBudget(systemInstruction, scenarioTitle, 0);

    // The latest message should fit within budget
    const lastMsg = makeMessage("last", "consumer", "Y".repeat(100));
    const lastMsgSerialized = JSON.stringify([{ sender: "consumer", text: "Y".repeat(100) }]).length;
    expect(lastMsgSerialized).toBeLessThanOrEqual(budget);

    // Build history where several old messages must be dropped
    const chatHistory: ChatMessage[] = [
      makeMessage("1", "agent", "A".repeat(8000)),
      makeMessage("2", "consumer", "B".repeat(8000)),
      makeMessage("3", "agent", "C".repeat(8000)),
      lastMsg,
    ];

    const { compacted } = compactChatHistory(chatHistory, budget);

    // Latest message must be preserved
    expect(compacted[compacted.length - 1]).toEqual(lastMsg);

    const prompt = buildKetikTurnPrompt({
      scenarioTitle,
      chatHistory: compacted,
      omittedCount: chatHistory.length - compacted.length,
    });

    const totalPrompt = systemInstruction.length + prompt.length;
    expect(totalPrompt).toBeLessThanOrEqual(KETIK_PROMPT_BUDGET);
  });

  it("accounts for special-character expansion in compaction size (escaped < > & U+2028 U+2029)", () => {
    // Build a system instruction with no special chars
    const systemInstruction = "X".repeat(2000);
    const scenarioTitle = "Test Escaped";

    // Build messages containing many special characters that serializeKetikPromptData expands
    const specialChars =
      "A<tag>B&copy;C\u2028D\u2029E<xml>&amp;F<![CDATA[&<>]]>G";
    // Each occurrence of < adds 5 bytes (1→6: '<' → '\\u003c')
    // Each occurrence of > adds 5 bytes
    // Each occurrence of & adds 5 bytes
    // Each occurrence of U+2028 adds 5 bytes (1→6)
    // Each occurrence of U+2029 adds 5 bytes
    // So the expanded form is significantly larger than raw JSON

    const chatHistory: ChatMessage[] = [
      makeMessage("1", "agent", `Start ${specialChars} end`),
      makeMessage("2", "consumer", `<<<&&&>>>${specialChars}!!!`),
      makeMessage("3", "agent", `\u2028`.repeat(50)),
      makeMessage("4", "consumer", `\u2029`.repeat(50)),
      makeMessage("5", "agent", `<script>&escape</script>`),
      makeMessage("6", "consumer", `Normal message with &, <, >, \u2028, and \u2029`),
      makeMessage("7", "agent", "Final latest message must be preserved"),
    ];

    // Compute budget with runtime values
    const availableBudget = computeAvailableHistoryBudget(
      systemInstruction,
      scenarioTitle,
      chatHistory.length,
    );

    const { compacted, omittedCount } = compactChatHistory(
      chatHistory,
      availableBudget,
    );

    // Latest message invariant
    expect(compacted[compacted.length - 1]).toEqual(chatHistory[chatHistory.length - 1]);

    // Build the actual turn prompt
    const prompt = buildKetikTurnPrompt({
      scenarioTitle,
      chatHistory: compacted,
      omittedCount,
    });

    // Total assembled prompt must stay within budget
    const totalPrompt = systemInstruction.length + prompt.length;
    expect(totalPrompt).toBeLessThanOrEqual(KETIK_PROMPT_BUDGET);

    // Verify that serializeKetikPromptData actually expands the special chars
    // (if it didn't, the test wouldn't be meaningful)
    const rawJson = JSON.stringify([{ sender: "agent", text: `<test>&` }]);
    const escaped = serializeKetikPromptData([{ sender: "agent", text: `<test>&` }]);
    expect(escaped.length).toBeGreaterThan(rawJson.length);
  });
});
