import type { ClientResponse } from "hono/client";
import { sidakClient, unwrapResponse } from "./api";
import type {
  ApiResponse,
  SidakHeatmapCountBy,
  SidakHeatmapMode,
  SidakHeatmapResponse,
  ServiceType,
} from "@trainers/types";

/**
 * Facade bertipe untuk endpoint heatmap, dipakai oleh halaman heatmap utama DAN
 * tab Heatmap di detail agent supaya keduanya memakai satu jalur request.
 *
 * Router Hono modul SIDAK belum di-chain, sehingga `AppType` tidak membawa rute
 * heatmap (lihat catatan yang sama di `lib/api/rpc-client.ts`). Facade lokal ini
 * menegakkan bentuk query/response di sisi web tanpa mengembalikan helper lama:
 * seluruh request tetap lewat `sidakClient`, jadi auth, redirect 401, dan
 * deteksi fallback HTML (`rpcFetch`) tetap berlaku.
 */
type HeatmapRpcResponse = ClientResponse<
  ApiResponse<SidakHeatmapResponse>,
  number,
  "json"
>;
type HeatmapClient = {
  heatmap: {
    $get(args: {
      query: {
        mode: SidakHeatmapMode;
        year: string;
        service_type?: ServiceType;
        count_by: SidakHeatmapCountBy;
        agent_id?: string;
      };
      signal?: AbortSignal;
    }): Promise<HeatmapRpcResponse>;
  };
};
const heatmapClient = sidakClient as unknown as HeatmapClient;

export async function fetchSidakHeatmap(params: {
  mode: SidakHeatmapMode;
  year: number;
  countBy: SidakHeatmapCountBy;
  serviceType?: ServiceType;
  agentId?: string;
  signal?: AbortSignal;
}): Promise<SidakHeatmapResponse> {
  const query: {
    mode: SidakHeatmapMode;
    year: string;
    count_by: SidakHeatmapCountBy;
    service_type?: ServiceType;
    agent_id?: string;
  } = {
    mode: params.mode,
    year: String(params.year),
    count_by: params.countBy,
  };
  if (params.serviceType) query.service_type = params.serviceType;
  if (params.agentId) query.agent_id = params.agentId;

  // `unwrapResponse` membuka envelope `{ success, data }` dan melempar
  // `ApiError` untuk `{ success: false }`, jadi pemanggil tidak pernah
  // menampilkan heatmap kosong saat query gagal.
  return unwrapResponse(
    await heatmapClient.heatmap.$get({ query, signal: params.signal }),
  );
}
