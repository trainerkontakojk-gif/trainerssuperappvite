import { useState } from "react";
import { sidakClient, unwrapResponse } from "../../../lib/api";
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
  const [editTanggalLayanan, setEditTanggalLayanan] = useState("");
  const [editTanggalSampel, setEditTanggalSampel] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (item: {
    id: string;
    nilai: number;
    ketidaksesuaian?: string | null;
    sebaiknya?: string | null;
    tanggal_layanan?: string | null;
    tanggal_sampel?: string | null;
  }) => {
    setEditingId(item.id);
    setEditNilai(item.nilai);
    setEditKetidaksesuaian(item.ketidaksesuaian ?? "");
    setEditSebaiknya(item.sebaiknya ?? "");
    setEditTanggalLayanan(item.tanggal_layanan ?? "");
    setEditTanggalSampel(item.tanggal_sampel ?? "");
    setDeletingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const handleSaveEdit = async (id: string) => {
    setSavingEdit(true);
    setErrorMsg(null);
    try {
      await unwrapResponse(await sidakClient.temuan[":id"].$put({ param: { id }, json: {
        nilai: editNilai,
        ketidaksesuaian: editKetidaksesuaian || null,
        sebaiknya: editSebaiknya || null,
        // String kosong berarti "kosongkan tanggal" di baris ini saja, bukan
        // mengubah tanggal parameter lain pada tiket yang sama.
        tanggal_layanan: editTanggalLayanan || null,
        tanggal_sampel: editTanggalSampel || null,
      }}));
      setTemuan((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                nilai: editNilai,
                ketidaksesuaian: editKetidaksesuaian,
                sebaiknya: editSebaiknya,
                tanggal_layanan: editTanggalLayanan || null,
                tanggal_sampel: editTanggalSampel || null,
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
      await unwrapResponse(await sidakClient.temuan[":id"].$delete({ param: { id } }));
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
    editTanggalLayanan,
    setEditTanggalLayanan,
    editTanggalSampel,
    setEditTanggalSampel,
    deletingId,
    setDeletingId,
    savingEdit,
    startEdit,
    cancelEdit,
    handleSaveEdit,
    handleDelete,
  };
}
