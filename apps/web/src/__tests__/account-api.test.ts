import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPost, mockUnwrapResponse } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockUnwrapResponse: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  rpcClient: {
    v1: {
      me: {
        "revoke-sessions": {
          $post: mockPost,
        },
      },
    },
  },
  unwrapResponse: mockUnwrapResponse,
}));

import { accountApi } from "../lib/accountApi";

describe("accountApi.revokeAllSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ ok: true });
    mockUnwrapResponse.mockResolvedValue({ success: true });
  });

  it("uses the typed revoke-sessions RPC route and unwrapResponse", async () => {
    await expect(accountApi.revokeAllSessions()).resolves.toEqual({
      success: true,
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockUnwrapResponse).toHaveBeenCalledWith({ ok: true });
  });

  it("maps network failures to a human-friendly message", async () => {
    mockPost.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(accountApi.revokeAllSessions()).rejects.toThrow(
      "Gagal menghubungkan ke server. Periksa koneksi internet Anda atau coba lagi sesaat lagi.",
    );

    expect(mockUnwrapResponse).not.toHaveBeenCalled();
  });
});
