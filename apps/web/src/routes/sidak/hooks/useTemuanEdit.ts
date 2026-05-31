import { useState } from "react";
import { putApi, deleteApi } from "../../../hooks/useApi";
import type { QATemuan } from "@trainers/types";

interface UseTemuanEditParams {
  temuan: QATemuan[];
  setTemuan: React.Dispatch<React.SetStateAction<QATemuan[]>>;
  setErrorMsg: (msg: string | null) => void;
  setSuccessMsg: (msg: string | null) => void;
}

export function useTemuanEdit({
  temuan: _temuan,
  setTemuan,
  setErrorMsg,
  setSuccessMsg,
}: UseTemuanEditParams) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNilai, setEditNilai] = useState(3);
  const [editKetidaksesuaian, setEditKetidaksesuaian] = useState("");
  const [editSebaiknya, setEditSebaiknya] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (item: {
    id: string;
    nilai: number;
    ketidaksesuaian?: string | null;
    sebaiknya?: string | null;
  }) => {
    setEditingId(item.id);
    setEditNilai(item.nilai);
    setEditKetidaksesuaian(item.ketidaksesuaian ?? "");
    setEditSebaiknya(item.sebaiknya ?? "");
    setDeletingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const handleSaveEdit = async (id: string) => {
    setSavingEdit(true);
    setErrorMsg(null);
    try {
      await putApi(`/sidak/temuan/${id}`, {
        nilai: editNilai,
        ketidaksesuaian: editKetidaksesuaian || null,
        sebaiknya: editSebaiknya || null,
      });
      setTemuan((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                nilai: editNilai,
                ketidaksesuaian: editKetidaksesuaian,
                sebaiknya: editSebaiknya,
              }
            : t
        )
      );
      setEditingId(null);
      setSuccessMsg("Temuan berhasil diperbarui!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setErrorMsg(e.message || "Gagal memperbarui temuan");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      setEditingId(null);
      return;
    }
    try {
      await deleteApi(`/sidak/temuan/${id}`);
      setTemuan((prev) => prev.filter((t) => t.id !== id));
      setDeletingId(null);
      setSuccessMsg("Temuan berhasil dihapus!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setErrorMsg(e.message || "Gagal menghapus temuan");
      setDeletingId(null);
    }
  };

  return {
    editingId,
    setEditingId,
    editNilai,
    setEditNilai,
    editKetidaksesuaian,
    setEditKetidaksesuaian,
    editSebaiknya,
    setEditSebaiknya,
    deletingId,
    setDeletingId,
    savingEdit,
    startEdit,
    cancelEdit,
    handleSaveEdit,
    handleDelete,
  };
}
