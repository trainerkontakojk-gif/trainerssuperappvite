import { createAdminClient } from "../lib/supabase";

export type MonitoringHistoryModule = "ketik" | "pdkt" | "telefun";

export type MonitoringHistoryDeleteResult = {
  module: MonitoringHistoryModule;
  id: string;
  source: "ketik_history" | "pdkt_history" | "telefun_history" | "results";
  deleted: true;
};

const validSourcesByModule = {
  ketik: ["ketik_history"],
  pdkt: ["pdkt_history"],
  telefun: ["telefun_history", "results"],
} as const satisfies Record<MonitoringHistoryModule, readonly string[]>;

export class MonitoringHistoryDeleteError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "DELETE_FAILED",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * Deletes a monitoring history entry atomically using a Supabase RPC.
 */
export async function deleteMonitoringHistory(
  module: MonitoringHistoryModule,
  id: string,
): Promise<MonitoringHistoryDeleteResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("delete_monitoring_history", {
    p_module: module,
    p_id: id,
  });

  if (error) {
    if (error.message.includes("monitoring history not found")) {
      throw new MonitoringHistoryDeleteError(
        "NOT_FOUND",
        "Riwayat simulasi tidak ditemukan.",
        { cause: error },
      );
    }

    throw new MonitoringHistoryDeleteError(
      "DELETE_FAILED",
      "Gagal menghapus riwayat simulasi.",
      { cause: error },
    );
  }

  const validSource =
    data &&
    typeof data === "object" &&
    "source" in data &&
    validSourcesByModule[module].some((source) => source === data.source);

  if (
    !data ||
    typeof data !== "object" ||
    data.module !== module ||
    data.id !== id ||
    data.deleted !== true ||
    !validSource
  ) {
    throw new MonitoringHistoryDeleteError(
      "DELETE_FAILED",
      "Gagal menghapus riwayat simulasi: payload tidak valid.",
    );
  }

  return {
    module,
    id,
    source: data.source,
    deleted: true,
  };
}
