import { describe, expect, it } from "vitest";
import {
  getAuthCallbackDestination,
  getAuthCallbackError,
} from "../routes/auth-callback-contract";

describe("auth callback contract", () => {
  it("routes active profiles to dashboard", () => {
    expect(getAuthCallbackDestination({ status: "active" })).toBe("/dashboard");
  });

  it("routes non-active or missing profiles to waiting approval", () => {
    expect(getAuthCallbackDestination({ status: "pending" })).toBe(
      "/waiting-approval",
    );
    expect(getAuthCallbackDestination({ status: "inactive" })).toBe(
      "/waiting-approval",
    );
    expect(getAuthCallbackDestination(null)).toBe("/waiting-approval");
  });

  it("returns a human-readable error when no OAuth session exists", () => {
    expect(getAuthCallbackError(new Error("provider failed"), null)).toBe(
      "Login Google gagal diselesaikan. Silakan kembali dan coba lagi.",
    );
    expect(getAuthCallbackError(null, null)).toBe(
      "Sesi login Google tidak ditemukan. Silakan kembali dan coba lagi.",
    );
    expect(getAuthCallbackError(null, { user: { id: "user-1" } })).toBeNull();
  });
});
