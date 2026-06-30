import { describe, it, expect, vi, beforeEach } from "vitest";

function buildQuery(onAwait: () => any) {
  const q = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (resolve: any) => resolve(onAwait());
        return () => q;
      },
    },
  );
  return q;
}

let pendingResolve: () => any = () => ({ data: [], error: null });
let pendingRpcResolve: () => any = () => ({ error: null });

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => buildQuery(() => pendingResolve())),
    rpc: vi.fn(() => Promise.resolve(pendingRpcResolve())),
  },
  createAdminClient: vi.fn(),
}));

import * as profilerService from "../services/profiler-service";

describe("profiler-service", () => {
  beforeEach(() => {
    pendingResolve = () => ({ data: [], error: null });
    pendingRpcResolve = () => ({ error: null });
  });

  describe("getYears", () => {
    it("returns years descending", async () => {
      pendingResolve = () => ({
        data: [{ id: "y1", year: 2025 }],
        error: null,
      });
      const r = await profilerService.getYears();
      expect(r).toHaveLength(1);
    });

    it("includes parent folder year when scoped access points to a subfolder", async () => {
      const responses = [
        { data: [{ batch_name: "Batch Fahmi" }], error: null },
        {
          data: [
            {
              id: "batch-fahmi",
              name: "Batch Fahmi",
              parent_id: "team-call",
              year_id: null,
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: "team-call",
              name: "Tim Call Fahmi",
              parent_id: null,
              year_id: "year-2026",
            },
          ],
          error: null,
        },
        {
          data: [{ id: "year-2026", year: 2026, label: "Tahun 2026" }],
          error: null,
        },
      ];
      pendingResolve = () => responses.shift() ?? { data: [], error: null };

      await expect(profilerService.getYears(["peserta-1"])).resolves.toEqual([
        { id: "year-2026", year: 2026, label: "Tahun 2026" },
      ]);
    });
  });

  describe("createYear", () => {
    it("creates year with label", async () => {
      pendingResolve = () => ({
        data: { id: "y1", year: 2025, label: "Tahun 2025" },
        error: null,
      });
      const r = await profilerService.createYear(2025);
      expect(r.label).toBe("Tahun 2025");
    });

    it("throws on error", async () => {
      pendingResolve = () => ({ data: null, error: { message: "dup" } });
      await expect(profilerService.createYear(2025)).rejects.toThrow();
    });
  });

  describe("getFolders", () => {
    it("returns folders ordered by name", async () => {
      pendingResolve = () => ({
        data: [{ id: "f1", name: "Batch 1" }],
        error: null,
      });
      const r = await profilerService.getFolders();
      expect(r).toHaveLength(1);
    });

    it("returns parent folder with scoped subfolder so KTP can render the tree", async () => {
      const childFolder = {
        id: "batch-fahmi",
        name: "Batch Fahmi",
        parent_id: "team-call",
        year_id: "year-2026",
      };
      const parentFolder = {
        id: "team-call",
        name: "Tim Call Fahmi",
        parent_id: null,
        year_id: "year-2026",
      };
      const responses = [
        { data: [{ batch_name: "Batch Fahmi" }], error: null },
        { data: [childFolder], error: null },
        { data: [parentFolder], error: null },
      ];
      pendingResolve = () => responses.shift() ?? { data: [], error: null };

      await expect(profilerService.getFolders(["peserta-1"])).resolves.toEqual(
        [parentFolder, childFolder],
      );
    });
  });

  describe("createFolder", () => {
    it("creates with params", async () => {
      pendingResolve = () => ({
        data: { id: "f1", name: "New Folder" },
        error: null,
      });
      const r = await profilerService.createFolder({ name: "New Folder" });
      expect(r.name).toBe("New Folder");
    });
  });

  describe("getPeserta", () => {
    it("fetches with filters", async () => {
      pendingResolve = () => ({
        data: [{ id: "p1", nama: "Budi" }],
        count: 1,
        error: null,
      });
      const r = await profilerService.getPeserta({ batch_name: "Batch 1" });
      expect(r.data).toHaveLength(1);
      expect(r.total).toBe(1);
    });

    it("defaults to empty array when null", async () => {
      pendingResolve = () => ({ data: null, error: null });
      const r = await profilerService.getPeserta({});
      expect(r.data).toEqual([]);
    });
  });

  describe("getPesertaById", () => {
    it("fetches single", async () => {
      pendingResolve = () => ({
        data: { id: "p1", nama: "Budi" },
        error: null,
      });
      const r = await profilerService.getPesertaById("p1");
      expect(r.nama).toBe("Budi");
    });

    it("throws when not found", async () => {
      pendingResolve = () => ({ data: null, error: { message: "Not found" } });
      await expect(profilerService.getPesertaById("bad")).rejects.toThrow(
        "Peserta tidak ditemukan",
      );
    });
  });

  describe("getPesertaByBatch", () => {
    it("returns array", async () => {
      pendingResolve = () => ({
        data: [{ id: "p1", nama: "Budi" }],
        error: null,
      });
      const r = await profilerService.getPesertaByBatch("Batch 1");
      expect(r).toHaveLength(1);
    });
  });

  describe("createPeserta", () => {
    it("creates with minimal fields", async () => {
      let calls = 0;
      pendingResolve = () =>
        calls++ === 0
          ? { data: null, error: null }
          : { data: { id: "p1", nama: "Test" }, error: null };
      const r = await profilerService.createPeserta({
        nama: "Test",
        batch_name: "B1",
      });
      expect(r.nama).toBe("Test");
    });

    it("rejects duplicate names in the same batch before insert", async () => {
      pendingResolve = () => ({ data: { id: "p1" }, error: null });
      await expect(
        profilerService.createPeserta({ nama: "Test", batch_name: "B1" }),
      ).rejects.toThrow(
        'Peserta dengan nama "Test" sudah terdaftar di batch "B1"',
      );
    });
  });

  describe("updatePeserta", () => {
    it("updates and returns", async () => {
      pendingResolve = () => ({
        data: { id: "p1", nama: "Updated" },
        error: null,
      });
      const r = await profilerService.updatePeserta("p1", { nama: "Updated" });
      expect(r.nama).toBe("Updated");
    });
  });

  describe("deletePeserta", () => {
    it("resolves on success", async () => {
      pendingResolve = () => ({ error: null });
      await expect(
        profilerService.deletePeserta("p1"),
      ).resolves.toBeUndefined();
    });
  });

  describe("getTeams", () => {
    it("returns teams", async () => {
      pendingResolve = () => ({
        data: [{ id: "t1", nama: "Telepon" }],
        error: null,
      });
      const r = await profilerService.getTeams();
      expect(r).toHaveLength(1);
    });
  });

  describe("createTeam", () => {
    it("creates team", async () => {
      pendingResolve = () => ({
        data: { id: "t1", nama: "New Team" },
        error: null,
      });
      const r = await profilerService.createTeam("New Team");
      expect(r.nama).toBe("New Team");
    });
  });

  describe("deleteTeam", () => {
    it("resolves", async () => {
      pendingResolve = () => ({ error: null });
      await expect(profilerService.deleteTeam("t1")).resolves.toBeUndefined();
    });
  });

  describe("reorderPeserta", () => {
    it("resolves on success", async () => {
      pendingRpcResolve = () => ({ error: null });
      await expect(profilerService.reorderPeserta(["p1", "p2"])).resolves.toBeUndefined();
    });

    it("throws user-friendly error when unauthorized", async () => {
      pendingRpcResolve = () => ({ error: { message: "Unauthorized role check" } });
      await expect(profilerService.reorderPeserta(["p1"])).rejects.toThrow(
        "Konfigurasi reorder belum sinkron. Hubungi administrator."
      );
    });

    it("throws user-friendly error when payload is invalid/duplicate", async () => {
      pendingRpcResolve = () => ({ error: { message: "Payload reorder mengandung id duplikat" } });
      await expect(profilerService.reorderPeserta(["p1"])).rejects.toThrow(
        "Payload urutan tidak valid. Muat ulang data lalu coba lagi."
      );
    });

    it("throws user-friendly error when data is not found", async () => {
      pendingRpcResolve = () => ({ error: { message: "Sebagian data reorder tidak ditemukan" } });
      await expect(profilerService.reorderPeserta(["p1"])).rejects.toThrow(
        "Sebagian peserta tidak ditemukan. Muat ulang folder lalu coba lagi."
      );
    });
  });

  describe("getFolderCounts", () => {
    it("maps RPC rows into folder count record", async () => {
      pendingRpcResolve = () => ({
        data: [
          { batch_name: "Batch 1", peserta_count: 2 },
          { batch_name: "Batch 2", peserta_count: "5" },
        ],
        error: null,
      });

      await expect(profilerService.getFolderCounts()).resolves.toEqual({
        "Batch 1": 2,
        "Batch 2": 5,
      });
    });

    it("returns empty object for empty scoped ID list", async () => {
      await expect(profilerService.getFolderCounts([])).resolves.toEqual({});
    });

    it("throws on RPC error", async () => {
      pendingRpcResolve = () => ({
        data: null,
        error: { message: "boom" },
      });

      await expect(profilerService.getFolderCounts()).rejects.toThrow("boom");
    });
  });

  describe("bulkReorderPeserta", () => {
    it("resolves on success", async () => {
      pendingRpcResolve = () => ({ error: null });
      await expect(profilerService.bulkReorderPeserta([{ id: "p1", nomor_urut: 1 }])).resolves.toBeUndefined();
    });

    it("throws user-friendly error on failure", async () => {
      pendingRpcResolve = () => ({ error: { message: "some error" } });
      await expect(profilerService.bulkReorderPeserta([{ id: "p1", nomor_urut: 1 }])).rejects.toThrow();
    });
  });
});
