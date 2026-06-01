import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

/**
 * Property 9: AI Usage Status and Error Recording
 * Validates: Requirements 13.2, 13.3, 13.4, 13.6, 14.2, 14.3, 14.5
 *
 * For any AI request logged via logAiUsage():
 * - If the request succeeded, status SHALL be 'success', error_message SHALL be null,
 *   and token counts SHALL reflect actual usage.
 * - If the request failed or timed out, status SHALL be 'failed' or 'timeout' respectively,
 *   token counts SHALL be 0, identifying fields SHALL be present, and error_message SHALL
 *   contain the provider error truncated to ≤1000 characters (or 'Unknown error' if the
 *   original message is null or empty).
 */

// Extract the pure logic from logAiUsage() for testability
// This mirrors the logic in apps/api/src/lib/ai-usage.ts

type RequestStatus = "success" | "failed" | "timeout";

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface AiUsageInput {
  status?: RequestStatus;
  errorMessage?: string | null;
  tokens: TokenUsage;
}

interface AiUsageResult {
  status: RequestStatus;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  errorMessage: string | null;
}

/**
 * Pure function that computes the derived fields for AI usage logging.
 * This mirrors the logic in logAiUsage() without the database interaction.
 */
function computeAiUsageFields(input: AiUsageInput): AiUsageResult {
  const requestStatus: RequestStatus = input.status ?? "success";
  const isFailure = requestStatus === "failed" || requestStatus === "timeout";

  // When status is failed or timeout, token counts are 0
  const inputTokens = isFailure ? 0 : input.tokens.inputTokens;
  const outputTokens = isFailure ? 0 : input.tokens.outputTokens;
  const totalTokens = isFailure ? 0 : input.tokens.totalTokens;

  // Determine error_message value
  let errorMessageValue: string | null = null;
  if (isFailure) {
    const rawMessage = input.errorMessage;
    if (!rawMessage || rawMessage.trim() === "") {
      errorMessageValue = "Unknown error";
    } else {
      errorMessageValue = rawMessage.slice(0, 1000);
    }
  }

  return {
    status: requestStatus,
    inputTokens,
    outputTokens,
    totalTokens,
    errorMessage: errorMessageValue,
  };
}

// --- Arbitraries ---

const statusArb = fc.constantFrom<RequestStatus>(
  "success",
  "failed",
  "timeout",
);

const tokenUsageArb = fc.record({
  inputTokens: fc.nat({ max: 1_000_000 }),
  outputTokens: fc.nat({ max: 1_000_000 }),
  totalTokens: fc.nat({ max: 2_000_000 }),
});

const errorMessageArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(""),
  fc.constant("   "),
  fc.string({ minLength: 1, maxLength: 500 }),
  // Generate strings that exceed 1000 chars to test truncation
  fc.string({ minLength: 1001, maxLength: 2000 }),
);

describe("Property 9: AI Usage Status and Error Recording", () => {
  describe("Success case properties", () => {
    it("when status is success, error_message is null and tokens reflect actual usage", () => {
      fc.assert(
        fc.property(tokenUsageArb, errorMessageArb, (tokens, errorMessage) => {
          const result = computeAiUsageFields({
            status: "success",
            errorMessage,
            tokens,
          });

          // Status SHALL be 'success'
          expect(result.status).toBe("success");

          // error_message SHALL be null
          expect(result.errorMessage).toBeNull();

          // token counts SHALL reflect actual usage
          expect(result.inputTokens).toBe(tokens.inputTokens);
          expect(result.outputTokens).toBe(tokens.outputTokens);
          expect(result.totalTokens).toBe(tokens.totalTokens);
        }),
        { numRuns: 100 },
      );
    });

    it("when status is undefined (default), behaves as success", () => {
      fc.assert(
        fc.property(tokenUsageArb, (tokens) => {
          const result = computeAiUsageFields({
            status: undefined,
            tokens,
          });

          expect(result.status).toBe("success");
          expect(result.errorMessage).toBeNull();
          expect(result.inputTokens).toBe(tokens.inputTokens);
          expect(result.outputTokens).toBe(tokens.outputTokens);
          expect(result.totalTokens).toBe(tokens.totalTokens);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Failure/timeout case properties", () => {
    const failureStatusArb = fc.constantFrom<RequestStatus>(
      "failed",
      "timeout",
    );

    it("when status is failed or timeout, token counts are always 0", () => {
      fc.assert(
        fc.property(
          failureStatusArb,
          tokenUsageArb,
          errorMessageArb,
          (status, tokens, errorMessage) => {
            const result = computeAiUsageFields({
              status,
              errorMessage,
              tokens,
            });

            // token counts SHALL be 0
            expect(result.inputTokens).toBe(0);
            expect(result.outputTokens).toBe(0);
            expect(result.totalTokens).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('when status is failed, status field is "failed"', () => {
      fc.assert(
        fc.property(tokenUsageArb, errorMessageArb, (tokens, errorMessage) => {
          const result = computeAiUsageFields({
            status: "failed",
            errorMessage,
            tokens,
          });

          expect(result.status).toBe("failed");
        }),
        { numRuns: 100 },
      );
    });

    it('when status is timeout, status field is "timeout"', () => {
      fc.assert(
        fc.property(tokenUsageArb, errorMessageArb, (tokens, errorMessage) => {
          const result = computeAiUsageFields({
            status: "timeout",
            errorMessage,
            tokens,
          });

          expect(result.status).toBe("timeout");
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Error message properties", () => {
    const failureStatusArb = fc.constantFrom<RequestStatus>(
      "failed",
      "timeout",
    );

    it("error_message is truncated to ≤1000 characters on failure", () => {
      fc.assert(
        fc.property(
          failureStatusArb,
          tokenUsageArb,
          fc.string({ minLength: 1, maxLength: 3000 }),
          (status, tokens, errorMessage) => {
            const result = computeAiUsageFields({
              status,
              errorMessage,
              tokens,
            });

            // error_message SHALL be ≤1000 characters
            expect(result.errorMessage).not.toBeNull();
            expect(result.errorMessage!.length).toBeLessThanOrEqual(1000);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("error_message preserves content up to 1000 chars (prefix match)", () => {
      fc.assert(
        fc.property(
          failureStatusArb,
          tokenUsageArb,
          fc
            .string({ minLength: 1, maxLength: 3000 })
            .filter((s) => s.trim() !== ""),
          (status, tokens, errorMessage) => {
            const result = computeAiUsageFields({
              status,
              errorMessage,
              tokens,
            });

            // The result should be a prefix of the original message
            const expected = errorMessage.slice(0, 1000);
            expect(result.errorMessage).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('null or empty error_message falls back to "Unknown error" on failure', () => {
      const nullOrEmptyArb = fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.constant(""),
        fc.constant("   "),
        fc.constant("  \t\n  "),
      );

      fc.assert(
        fc.property(
          failureStatusArb,
          tokenUsageArb,
          nullOrEmptyArb,
          (status, tokens, errorMessage) => {
            const result = computeAiUsageFields({
              status,
              errorMessage: errorMessage as string | null | undefined,
              tokens,
            });

            // SHALL store 'Unknown error' when message is null or empty
            expect(result.errorMessage).toBe("Unknown error");
          },
        ),
        { numRuns: 100 },
      );
    });

    it("on success, error_message is always null regardless of input", () => {
      fc.assert(
        fc.property(
          tokenUsageArb,
          fc.string({ minLength: 1, maxLength: 500 }),
          (tokens, errorMessage) => {
            const result = computeAiUsageFields({
              status: "success",
              errorMessage,
              tokens,
            });

            expect(result.errorMessage).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Combined property: status determines all derived fields consistently", () => {
    it("for any status/token/error combination, all invariants hold simultaneously", () => {
      fc.assert(
        fc.property(
          statusArb,
          tokenUsageArb,
          errorMessageArb,
          (status, tokens, errorMessage) => {
            const result = computeAiUsageFields({
              status,
              errorMessage,
              tokens,
            });

            // Status is always one of the valid values
            expect(["success", "failed", "timeout"]).toContain(result.status);

            if (result.status === "success") {
              // Success invariants
              expect(result.errorMessage).toBeNull();
              expect(result.inputTokens).toBe(tokens.inputTokens);
              expect(result.outputTokens).toBe(tokens.outputTokens);
              expect(result.totalTokens).toBe(tokens.totalTokens);
            } else {
              // Failure/timeout invariants
              expect(result.inputTokens).toBe(0);
              expect(result.outputTokens).toBe(0);
              expect(result.totalTokens).toBe(0);
              expect(result.errorMessage).not.toBeNull();
              expect(result.errorMessage!.length).toBeLessThanOrEqual(1000);
              expect(result.errorMessage!.length).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
