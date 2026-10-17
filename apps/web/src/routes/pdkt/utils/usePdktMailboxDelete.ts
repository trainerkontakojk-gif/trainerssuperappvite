import { useState } from "react";
import { pdktClient, unwrapResponse } from "../../../lib/api";
import { notify } from "../../../lib/toast";

type PendingDelete =
  { kind: "single"; id: string } | { kind: "bulk"; ids: string[] } | null;

interface UsePdktMailboxDeleteOptions {
  selectedId: string | null;
  setSelectedId: (id: string | null) => Promise<void>;
  refetch: () => Promise<unknown>;
}

/**
 * Bulk selection and the confirm-then-delete flow for mailbox emails. The
 * server decides who may delete; partial bulk failures are reported as counts.
 */
export function usePdktMailboxDelete({
  selectedId,
  setSelectedId,
  refetch,
}: UsePdktMailboxDeleteOptions) {
  // Bulk selection states
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(
    new Set(),
  );
  const [isBulkMode, setIsBulkMode] = useState(false);
  // Konfirmasi hapus email; dirender di dalam lapisan ruang kerja.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleBulkId = (id: string) => {
    setSelectedBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleBulkMode = () => {
    setIsBulkMode((prev) => !prev);
    setSelectedBulkIds(new Set());
  };

  const requestBulkDelete = () => {
    if (selectedBulkIds.size === 0) return;
    setPendingDelete({ kind: "bulk", ids: Array.from(selectedBulkIds) });
  };

  const requestDelete = (id: string) => {
    setPendingDelete({ kind: "single", id });
  };

  const deleteBulk = async (ids: string[]) => {
    try {
      const result = (await unwrapResponse(
        await pdktClient.mailbox["batch-delete"].$post({
          json: { ids },
        }),
      )) as {
        successCount: number;
        failureCount: number;
        errors: string[];
      };

      if (result.failureCount > 0) {
        // Pesan server memuat ID email; jangan ditampilkan.
        console.warn("[PDKT] Bulk delete partially failed:", result.errors);
        notify.warning(
          `${result.successCount} email dihapus. ${result.failureCount} email tidak bisa dihapus karena hanya pembuatnya, admin, atau trainer yang boleh menghapus.`,
        );
      } else {
        notify.success(`${result.successCount} email dihapus.`);
      }

      setSelectedBulkIds(new Set());
      setIsBulkMode(false);
      await refetch();
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null);
      }
    } catch (err) {
      console.error("[PDKT] Bulk delete failed:", err);
      notify.error("Email belum bisa dihapus. Coba lagi.");
    }
  };

  const deleteOne = async (id: string) => {
    try {
      await unwrapResponse(
        await pdktClient.mailbox[":id"].$delete({
          param: { id },
        }),
      );
      await refetch();
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      console.error("[PDKT] Delete failed:", err);
      notify.error("Email belum bisa dihapus. Coba lagi.");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      if (pendingDelete.kind === "bulk") {
        await deleteBulk(pendingDelete.ids);
      } else {
        await deleteOne(pendingDelete.id);
      }
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  };

  const cancelDelete = () => setPendingDelete(null);

  return {
    selectedBulkIds,
    isBulkMode,
    pendingDelete,
    isDeleting,
    toggleBulkId,
    toggleBulkMode,
    requestBulkDelete,
    requestDelete,
    confirmDelete,
    cancelDelete,
  };
}
