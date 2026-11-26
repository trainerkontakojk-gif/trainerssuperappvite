import { useState } from "react";
import { sidakClient, unwrapResponse } from "../../../lib/api";
import type { QATemuan } from "@trainers/types";
import type { TemuanItem } from "../../../components/sidak/TemuanGroupCard";
import { parseTimeDraft, timeDraft } from "../../../lib/sidak-temuan-time";
import type { ConfirmFn } from "../../../hooks/useConfirmRequest";

interface UseTemuanEditParams {
  temuan: QATemuan[];
  setTemuan: React.Dispatch<React.SetStateAction<QATemuan[]>>;
  setErrorMsg: (msg: string | null) => void;
  setSuccessMsg: (msg: string | null) => void;
  /** Konfirmasi hapus lewat `ConfirmDialog`. */
  confirm: ConfirmFn;
}

export function useTemuanEdit({
  temuan,
  setTemuan,
  setErrorMsg,
  setSuccessMsg,
  confirm,
}: UseTemuanEditParams) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNilai, setEditNilai] = useState(3);
  const [editKetidaksesuaian, setEditKetidaksesuaian] = useState("");
  const [editSebaiknya, setEditSebaiknya] = useState("");
  const [editTanggalLayanan, setEditTanggalLayanan] = useState("");
  const [editTanggalSampel, setEditTanggalSampel] = useState("");
  const [editTime, setEditTime] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (item: TemuanItem) => {
    setEditingId(item.id);
    setEditNilai(item.nilai);
    setEditKetidaksesuaian(item.ketidaksesuaian ?? "");
    setEditSebaiknya(item.sebaiknya ?? "");
    setEditTanggalLayanan(item.tanggal_layanan ?? "");
    setEditTanggalSampel(item.tanggal_sampel ?? "");
    setEditTime(item.service_type ? timeDraft(item.service_type, item) : "");
    setDeletingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const handleSaveEdit = async (id: string) => {
    const item = temuan.find((row) => row.id === id);
    if (!item) return;
    setSavingEdit(true);
    setErrorMsg(null);
    try {
      const time = parseTimeDraft(item.service_type, editTime);
      await unwrapResponse(
        await sidakClient.temuan[":id"].$put({
          param: { id },
          json: {
            nilai: editNilai,
            ketidaksesuaian: editKetidaksesuaian || null,
            sebaiknya: editSebaiknya || null,
            // String kosong berarti "kosongkan tanggal" di baris ini saja, bukan
            // mengubah tanggal parameter lain pada tiket yang sama.
            tanggal_layanan: editTanggalLayanan || null,
            tanggal_sampel: editTanggalSampel || null,
            ...time,
          },
        }),
      );
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
                ...time,
              }
            : t,
        ),
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

  const handleDelete = async (id: string, label: string) => {
    const ok = await confirm({
      title: "Hapus temuan ini?",
      description: `Temuan ${label} dihapus dari sesi ini dan skor sesi dihitung ulang.`,
      confirmLabel: "Hapus temuan",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(id);
    setEditingId(null);
    try {
      await unwrapResponse(
        await sidakClient.temuan[":id"].$delete({ param: { id } }),
      );
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
    editTime,
    setEditTime,
    deletingId,
    setDeletingId,
    savingEdit,
    startEdit,
    cancelEdit,
    handleSaveEdit,
    handleDelete,
  };
}
