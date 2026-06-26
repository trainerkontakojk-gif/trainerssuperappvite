import { rpcClient, unwrapResponse } from "./api";

export const accountApi = {
  revokeAllSessions: async (): Promise<{ success: boolean }> => {
    try {
      const response = await rpcClient.v1.me["revoke-sessions"].$post();
      return (await unwrapResponse(response)) as { success: boolean };
    } catch (error) {
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw new Error(
          "Gagal menghubungkan ke server. Periksa koneksi internet Anda atau coba lagi sesaat lagi.",
          { cause: error },
        );
      }

      throw error;
    }
  },
};
