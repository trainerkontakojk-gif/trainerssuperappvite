import { useState, useEffect } from "react";
import {
  Layers,
  Plus,
  Search,
  HelpCircle,
  Save,
  Trash2,
  Shield,
  Settings,
  Info,
  Check,
  Filter,
} from "lucide-react";
import { useApi, postApi, putApi, deleteApi } from "../../hooks/useApi";
import { notify } from "../../lib/toast";

interface AccessGroup {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean | null;
  created_at: string;
}

interface GroupItem {
  id: string;
  group_id: string;
  field_name: string;
  field_value: string;
  created_at: string;
}

interface ScopeOptions {
  fields: string[];
  distinctValues: Record<string, string[]>;
}

export default function AccessGroupsPage() {
  const {
    data: groups,
    loading: loadingGroups,
    refetch: refetchGroups,
  } = useApi<AccessGroup[]>("/admin/access-groups");
  const { data: scopeOptions } = useApi<ScopeOptions>(
    "/admin/access-scope-options",
  );

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const {
    data: selectedGroupItems,
    loading: loadingItems,
    refetch: refetchItems,
  } = useApi<GroupItem[]>(
    selectedGroupId ? `/admin/access-groups/${selectedGroupId}/items` : null,
  );

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");

  // Group Create/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AccessGroup | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupIsActive, setGroupIsActive] = useState(true);
  const [savingGroup, setSavingGroup] = useState(false);

  // New Rule State
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [addingRule, setAddingRule] = useState(false);

  // Select first group automatically when groups load
  useEffect(() => {
    if (groups && groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  // Set field default value when options load
  useEffect(() => {
    if (scopeOptions?.fields && scopeOptions.fields.length > 0) {
      setNewFieldName(scopeOptions.fields[0]);
    }
  }, [scopeOptions]);

  // Set default field value option when fieldName changes
  useEffect(() => {
    if (scopeOptions && newFieldName) {
      const vals = scopeOptions.distinctValues[newFieldName] || [];
      if (vals.length > 0) {
        setNewFieldValue(vals[0]);
      } else {
        setNewFieldValue("");
      }
    }
  }, [newFieldName, scopeOptions]);

  const handleOpenCreateModal = () => {
    setEditingGroup(null);
    setGroupName("");
    setGroupDescription("");
    setGroupIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (group: AccessGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupDescription(group.description || "");
    setGroupIsActive(group.is_active !== false);
    setIsModalOpen(true);
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setSavingGroup(true);
    try {
      if (editingGroup) {
        await putApi(`/admin/access-groups/${editingGroup.id}`, {
          name: groupName,
          description: groupDescription,
          is_active: groupIsActive,
        });
        notify.success("Grup akses berhasil diperbarui");
      } else {
        const newGroup = await postApi<AccessGroup>("/admin/access-groups", {
          name: groupName,
          description: groupDescription,
        });
        notify.success("Grup akses berhasil dibuat");
        setSelectedGroupId(newGroup.id);
      }
      setIsModalOpen(false);
      await refetchGroups();
    } catch (err: any) {
      notify.error(err.message || "Gagal menyimpan grup akses.");
    } finally {
      setSavingGroup(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !newFieldName || !newFieldValue) return;

    setAddingRule(true);
    try {
      await postApi(`/admin/access-groups/${selectedGroupId}/items`, {
        fieldName: newFieldName,
        fieldValue: newFieldValue,
      });
      setNewFieldValue("");
      await refetchItems();
    } catch (err: any) {
      notify.error(err.message || "Gagal menambahkan aturan akses.");
    } finally {
      setAddingRule(false);
    }
  };

  const handleDeleteRule = async (itemId: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus aturan akses ini?")) return;

    try {
      await deleteApi(`/admin/access-groups/items/${itemId}`);
      await refetchItems();
    } catch (err: any) {
      notify.error(err.message || "Gagal menghapus aturan akses.");
    }
  };

  const filteredGroups = (groups || []).filter(
    (g) =>
      g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.description &&
        g.description.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const selectedGroup = (groups || []).find((g) => g.id === selectedGroupId);
  const possibleValues = scopeOptions?.distinctValues[newFieldName] || [];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Layers className="h-3.5 w-3.5" />
            Access Scopes
          </div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Grup Akses
          </h2>
          <p className="mt-1 text-gray-500">
            Definisikan batasan wilayah kerja (skup data) untuk Leader
            berdasarkan kriteria dinamis.
          </p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/10 hover:bg-indigo-700 transition-all hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" />
          Grup Baru
        </button>
      </div>

      {/* Main Layout: Master-Detail Split */}
      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        {/* Left Side: Groups List */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama grup..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white pl-12 pr-4 py-3 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div className="rounded-2xl border bg-white p-2 shadow-sm space-y-1 max-h-[600px] overflow-y-auto">
            {loadingGroups ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                <span className="mt-2 text-xs font-semibold">
                  Memuat grup akses...
                </span>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                <Layers className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                <p className="text-xs font-semibold">
                  Tidak ada grup ditemukan
                </p>
              </div>
            ) : (
              filteredGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`w-full text-left rounded-xl p-4 transition-all ${
                    selectedGroupId === g.id
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm truncate">
                      {g.name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        g.is_active !== false
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {g.is_active !== false ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                  {g.description && (
                    <p className="mt-1 text-xs text-gray-400 line-clamp-1 leading-normal font-normal">
                      {g.description}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Group Rules Builder */}
        <div className="space-y-6">
          {selectedGroup ? (
            <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-6">
              {/* Header Group Details */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedGroup.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {selectedGroup.description || "Tidak ada deskripsi."}
                  </p>
                </div>
                <button
                  onClick={() => handleOpenEditModal(selectedGroup)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <Settings className="h-3.5 w-3.5 text-gray-400" />
                  Edit Grup
                </button>
              </div>

              {/* Rules List */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-indigo-500" />
                    Aturan Wilayah Kerja (Data Rules)
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Anggota grup ini hanya diperbolehkan mengakses data peserta
                    yang memenuhi kriteria aturan di bawah.
                  </p>
                </div>

                <div className="space-y-2">
                  {loadingItems ? (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                      <span className="mt-2 text-xs font-medium">
                        Memuat aturan akses...
                      </span>
                    </div>
                  ) : !selectedGroupItems || selectedGroupItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed py-10 text-center bg-gray-50/50">
                      <Info className="mx-auto h-6 w-6 text-gray-400 mb-2" />
                      <p className="text-xs font-semibold text-gray-600">
                        Belum ada aturan akses
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Semua data peserta terproteksi penuh hingga aturan
                        dibuat.
                      </p>
                    </div>
                  ) : (
                    selectedGroupItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm hover:shadow"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                            <Filter className="h-3 w-3" />
                            {item.field_name}
                          </span>
                          <span className="text-xs text-gray-400 font-medium">
                            =
                          </span>
                          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">
                            {item.field_value}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteRule(item.id)}
                          className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="Hapus aturan"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Rule Form */}
              {scopeOptions && (
                <form
                  onSubmit={handleAddRule}
                  className="rounded-xl border bg-indigo-50/30 p-5 space-y-4"
                >
                  <div>
                    <h5 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                      Tambah Aturan Baru
                    </h5>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      Pilih kriteria kolom data beserta nilainya.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                        Kolom
                      </label>
                      <select
                        value={newFieldName}
                        onChange={(e) => setNewFieldName(e.target.value)}
                        className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      >
                        {scopeOptions.fields.map((field) => (
                          <option key={field} value={field}>
                            {field}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                        Nilai Parameter
                      </label>
                      <select
                        value={newFieldValue}
                        onChange={(e) => setNewFieldValue(e.target.value)}
                        className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                      >
                        {possibleValues.map((val) => (
                          <option key={val} value={val}>
                            {val}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={addingRule || !newFieldValue}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                      >
                        <Plus className="h-4 w-4" />
                        Tambah
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed py-24 text-center bg-white shadow-sm flex flex-col items-center justify-center">
              <Layers className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="font-semibold text-gray-900">Pilih Grup Akses</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                Pilih salah satu grup akses di sebelah kiri untuk melihat detail
                atau mengelola aturan wilayah kerja.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Group Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {editingGroup ? "Edit Grup Akses" : "Buat Grup Akses Baru"}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Nama grup sebaiknya representatif untuk mempermudah identifikasi
              penugasan leader.
            </p>

            <form onSubmit={handleSaveGroup} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Nama Grup
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Tim Java, Area Jabodetabek"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Deskripsi
                </label>
                <textarea
                  placeholder="Jelaskan ruang lingkup atau peruntukan grup akses ini..."
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {editingGroup && (
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={groupIsActive}
                    onChange={(e) => setGroupIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label
                    htmlFor="is_active"
                    className="text-sm font-semibold text-gray-700"
                  >
                    Status Grup Aktif
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border px-4 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingGroup || !groupName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
