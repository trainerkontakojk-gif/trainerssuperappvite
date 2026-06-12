import { profilerClient, unwrapResponse } from "./api";
import { uploadProfilerPhoto } from "./profilerPhotoStorage";
import type {
  ProfilerYear,
  ProfilerFolder,
  ProfilerPeserta,
  ProfilerTim,
} from "@trainers/types";

export const profilerApi = {
  // Years
  getYears: (): Promise<ProfilerYear[]> =>
    unwrapResponse(profilerClient.years.$get()) as Promise<ProfilerYear[]>,
  createYear: (year: number): Promise<ProfilerYear> =>
    unwrapResponse(profilerClient.years.$post({ json: { year } })) as Promise<ProfilerYear>,
  deleteYear: (id: string): Promise<void> =>
    unwrapResponse(profilerClient.years[":id"].$delete({ param: { id } })) as Promise<void>,

  // Folders
  getFolders: (): Promise<ProfilerFolder[]> =>
    unwrapResponse(profilerClient.folders.$get()) as Promise<ProfilerFolder[]>,
  createFolder: (data: {
    name: string;
    year_id?: string;
    parent_id?: string;
  }): Promise<ProfilerFolder> =>
    unwrapResponse(profilerClient.folders.$post({ json: data })) as Promise<ProfilerFolder>,
  renameFolder: (id: string, name: string): Promise<ProfilerFolder> =>
    unwrapResponse(
      profilerClient.folders[":id"].$put({ param: { id }, json: { name } }),
    ) as Promise<ProfilerFolder>,
  deleteFolder: (id: string): Promise<void> =>
    unwrapResponse(profilerClient.folders[":id"].$delete({ param: { id } })) as Promise<void>,
  duplicateFolder: (
    folder_id: string,
    target_year_id: string,
  ): Promise<{ folder: ProfilerFolder; participants: ProfilerPeserta[] }> =>
    unwrapResponse(
      profilerClient.folders.duplicate.$post({
        json: { folder_id, target_year_id },
      }),
    ) as Promise<{ folder: ProfilerFolder; participants: ProfilerPeserta[] }>,

  // Counts
  getFolderCounts: (): Promise<Record<string, number>> =>
    unwrapResponse(profilerClient.counts.$get()) as Promise<Record<string, number>>,

  // Peserta
  getPeserta: (params?: {
    batch_name?: string;
    tim?: string;
    search?: string;
  }): Promise<{ items: ProfilerPeserta[]; total: number }> =>
    unwrapResponse(
      profilerClient.peserta.$get({ query: params ?? {} }),
    ) as Promise<{ items: ProfilerPeserta[]; total: number }>,
  getPesertaById: (id: string): Promise<ProfilerPeserta> =>
    unwrapResponse(profilerClient.peserta[":id"].$get({ param: { id } })) as Promise<ProfilerPeserta>,
  getPesertaByBatch: (batchName: string): Promise<ProfilerPeserta[]> =>
    unwrapResponse(
      profilerClient.peserta.batch[":batchName"].$get({ param: { batchName } }),
    ) as Promise<ProfilerPeserta[]>,
  createPeserta: (data: Partial<ProfilerPeserta>): Promise<ProfilerPeserta> =>
    unwrapResponse(profilerClient.peserta.$post({ json: data })) as Promise<ProfilerPeserta>,
  updatePeserta: (
    id: string,
    data: Partial<ProfilerPeserta>,
  ): Promise<ProfilerPeserta> =>
    unwrapResponse(
      profilerClient.peserta[":id"].$put({ param: { id }, json: data }),
    ) as Promise<ProfilerPeserta>,
  deletePeserta: (id: string): Promise<void> =>
    unwrapResponse(profilerClient.peserta[":id"].$delete({ param: { id } })) as Promise<void>,
  bulkCreatePeserta: (items: Partial<ProfilerPeserta>[]): Promise<ProfilerPeserta[]> =>
    unwrapResponse(profilerClient.peserta.bulk.$post({ json: { items } })) as Promise<ProfilerPeserta[]>,
  copyPesertaToFolder: (
    peserta_ids: string[],
    target_batch_name: string,
  ): Promise<ProfilerPeserta[]> =>
    unwrapResponse(
      profilerClient.peserta.copy.$post({
        json: { peserta_ids, target_batch_name },
      }),
    ) as Promise<ProfilerPeserta[]>,
  movePesertaToBatch: (
    peserta_ids: string[],
    target_batch_name: string,
  ): Promise<{ moved: number }> =>
    unwrapResponse(
      profilerClient.peserta.move.$post({
        json: { peserta_ids, target_batch_name },
      }),
    ) as Promise<{ moved: number }>,
  reorderPeserta: (peserta_ids: string[]): Promise<void> =>
    unwrapResponse(
      profilerClient.peserta.reorder.$put({ json: { peserta_ids } }),
    ) as Promise<void>,
  bulkReorderPeserta: (
    updates: { id: string; nomor_urut: number }[],
  ): Promise<void> =>
    unwrapResponse(
      profilerClient.peserta["bulk-reorder"].$post({ json: { updates } }),
    ) as Promise<void>,
  getGlobalPesertaPool: (excludeBatch?: string): Promise<ProfilerPeserta[]> => {
    const query = excludeBatch ? { exclude_batch: excludeBatch } : {};
    return unwrapResponse(profilerClient.peserta["global-pool"].$get({ query })) as Promise<ProfilerPeserta[]>;
  },

  // Teams
  getTeams: (): Promise<ProfilerTim[]> =>
    unwrapResponse(profilerClient.teams.$get()) as Promise<ProfilerTim[]>,
  createTeam: (nama: string): Promise<ProfilerTim> =>
    unwrapResponse(profilerClient.teams.$post({ json: { nama } })) as Promise<ProfilerTim>,
  deleteTeam: (id: string): Promise<void> =>
    unwrapResponse(profilerClient.teams[":id"].$delete({ param: { id } })) as Promise<void>,

  // File Upload
  uploadFoto: uploadProfilerPhoto,
};
