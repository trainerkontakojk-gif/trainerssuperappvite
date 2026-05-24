import { useState, useEffect } from "react";
import {
  UserCheck,
  ShieldCheck,
  XCircle,
  Search,
  HelpCircle,
  Save,
  Info,
  Check,
  ShieldAlert,
  ArrowRight,
  UserMinus,
  Plus,
  Settings,
} from "lucide-react";
import { useApi, postApi, putApi } from "../../hooks/useApi";
import { notify } from "../../lib/toast";
import type { PendingLeaderRequest, ApprovedLeaderAccess } from "@trainers/types";

interface AccessGroup {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean | null;
}

export default function AccessApprovalPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "approved">("pending");
  const [searchTerm, setSearchTerm] = useState("");

  const {
    data: pendingRequests,
    loading: loadingPending,
    refetch: refetchPending,
  } = useApi<PendingLeaderRequest[]>(
    activeTab === "pending" ? "/admin/leader-requests/pending" : null,
  );
  const {
    data: approvedRequests,
    loading: loadingApproved,
    refetch: refetchApproved,
  } = useApi<ApprovedLeaderAccess[]>(
    activeTab === "approved" ? "/admin/leader-requests/approved" : null,
  );
  const { data: groups } = useApi<AccessGroup[]>("/admin/access-groups");

  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

  // Group Assignments state (group IDs selected)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [actionNote, setActionNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [actionType, setActionType] = useState<
    "approve" | "reject" | "revoke" | "update_groups" | null
  >(null);

  const requests =
    activeTab === "pending" ? pendingRequests || [] : approvedRequests || [];

  const filteredRequests = requests.filter(
    (r) =>
      ("leader_email" in r ? r.leader_email?.toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
      ("leader_name" in r ? r.leader_name?.toLowerCase().includes(searchTerm.toLowerCase()) : false),
  );

  const selectedReq = requests.find((r) => r.id === selectedReqId);

  // Sync checkboxes when selectedReq changes
  useEffect(() => {
    if (selectedReq) {
      if ("access_group_ids" in selectedReq && selectedReq.access_group_ids) {
        setSelectedGroupIds(selectedReq.access_group_ids);
      } else {
        setSelectedGroupIds([]);
      }
      setActionNote("");
    } else {
      setSelectedGroupIds([]);
      setActionNote("");
    }
    setActionType(null);
  }, [selectedReq]);

  const handleToggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  };

  const handleAction = async (
    type: "approve" | "reject" | "revoke" | "update_groups",
  ) => {
    if (!selectedReqId) return;

    if (type === "approve" && selectedGroupIds.length === 0) {
      notify.warning("Pilih minimal satu grup akses sebelum menyetujui.");
      return;
    }

    if ((type === "reject" || type === "revoke") && !actionNote.trim()) {
      notify.warning(
        "Masukkan catatan/alasan penolakan atau pencabutan akses.",
      );
      return;
    }

    setProcessing(true);
    try {
      if (type === "approve") {
        await postApi(`/admin/leader-requests/${selectedReqId}/approve`, {
          accessGroupIds: selectedGroupIds,
        });
        notify.success("Permintaan akses berhasil disetujui");
      } else if (type === "reject") {
        await postApi(`/admin/leader-requests/${selectedReqId}/reject`, {
          note: actionNote,
        });
        notify.success("Permintaan akses berhasil ditolak");
      } else if (type === "revoke") {
        await postApi(`/admin/leader-requests/${selectedReqId}/revoke`, {
          note: actionNote,
        });
        notify.success("Akses berhasil dicabut");
      } else if (type === "update_groups") {
        await putApi(`/admin/leader-requests/${selectedReqId}/groups`, {
          accessGroupIds: selectedGroupIds,
        });
        notify.success("Grup akses berhasil diperbarui");
      }

      setSelectedReqId(null);
      if (activeTab === "pending") {
        await refetchPending();
      } else {
        await refetchApproved();
      }
    } catch (err: any) {
      notify.error(err.message || "Gagal memproses aksi.");
    } finally {
      setProcessing(false);
      setActionType(null);
    }
  };

  const activeGroups = (groups || []).filter((g) => g.is_active !== false);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <UserCheck className="h-3.5 w-3.5" />
            Verification Center
          </div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Persetujuan Akses
          </h2>
          <p className="mt-1 text-gray-500">
            Review permintaan hak akses kepemimpinan (Leader) dan petakan
            wilayah data mereka.
          </p>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border bg-white p-1 shadow-sm">
          {[
            { id: "pending", label: "Menunggu Review" },
            { id: "approved", label: "Telah Disetujui" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as "pending" | "approved");
                setSelectedReqId(null);
              }}
              className={`rounded-lg px-4 py-2 text-xs font-semibold tracking-wide transition-all ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        {/* Left Side: Requests List */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama atau email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white pl-12 pr-4 py-3 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div className="rounded-2xl border bg-white p-2 shadow-sm space-y-1 max-h-[600px] overflow-y-auto">
            {(activeTab === "pending" ? loadingPending : loadingApproved) ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                <span className="mt-2 text-xs font-semibold">
                  Memproses data...
                </span>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <UserCheck className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                <p className="text-xs font-semibold">Tidak ada permintaan</p>
              </div>
            ) : (
              filteredRequests.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedReqId(r.id)}
                  className={`w-full text-left rounded-xl p-4 transition-all ${
                    selectedReqId === r.id
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm truncate">
                      {r.leader_name || "Tanpa Nama"}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {new Date("created_at" in r ? r.created_at : r.approved_at).toLocaleDateString("id-ID")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400 truncate font-normal">
                    {r.leader_email}
                  </p>
                  {r.access_group_names && r.access_group_names.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.access_group_names.map((name: string, i: number) => (
                        <span
                          key={i}
                          className="rounded bg-indigo-100/50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Request Action Panel */}
        <div className="space-y-6">
          {selectedReq ? (
            <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-6">
              {/* Header Info */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {(selectedReq as any).leader_name || "Tanpa Nama"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {(selectedReq as any).leader_email}
                  </p>
                  <p className="mt-2 text-xs text-gray-400">
                    {"created_at" in selectedReq
                      ? `Diminta pada: ${new Date((selectedReq as any).created_at).toLocaleString("id-ID")}`
                      : `Disetujui pada: ${new Date((selectedReq as any).approved_at).toLocaleString("id-ID")}`
                    }
                  </p>
                </div>
                <div>
                  {"status" in selectedReq ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                        (selectedReq as any).status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : (selectedReq as any).status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {(selectedReq as any).status}
                    </span>
                  ) : (
                    <span className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                      Approved
                    </span>
                  )}
                </div>
              </div>

              {/* Access Scope Settings */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-indigo-500" />
                    Penugasan Wilayah Kerja (Access Groups)
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Tentukan satu atau lebih grup akses agar Leader ini dapat
                    memantau data peserta di dalamnya.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {activeGroups.map((group) => {
                    const isChecked = selectedGroupIds.includes(group.id);
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => handleToggleGroup(group.id)}
                        disabled={
                          processing ||
                          ((selectedReq as any).status !== "pending" &&
                            actionType !== "update_groups")
                        }
                        className={`flex items-start text-left gap-3 rounded-xl border p-4 transition-all ${
                          isChecked
                            ? "border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600"
                            : "border-gray-200 hover:bg-gray-50"
                        } disabled:opacity-70`}
                      >
                        <div
                          className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-all ${
                            isChecked
                              ? "border-indigo-600 bg-indigo-600 text-white"
                              : "border-gray-300"
                          }`}
                        >
                          {isChecked && (
                            <Check className="h-3 w-3 stroke-[3]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-xs text-gray-900 block truncate">
                            {group.name}
                          </span>
                          {group.description && (
                            <p className="text-[10px] text-gray-400 line-clamp-2 mt-0.5 leading-normal">
                              {group.description}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Box */}
              <div className="rounded-xl border bg-gray-50/50 p-5 space-y-4">
                {(selectedReq as any).status === "pending" ? (
                  <>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wide">
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      Keputusan Approval
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                          Catatan Internal / Alasan Penolakan (Wajib jika
                          menolak)
                        </label>
                        <textarea
                          placeholder="Tulis alasan jika menolak permintaan..."
                          value={actionNote}
                          onChange={(e) => setActionNote(e.target.value)}
                          rows={2}
                          className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                        />
                      </div>

                      <div className="flex flex-wrap gap-3 pt-2">
                        <button
                          onClick={() => handleAction("approve")}
                          disabled={processing || selectedGroupIds.length === 0}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                          Setujui Akses Leader
                        </button>
                        <button
                          onClick={() => handleAction("reject")}
                          disabled={processing || !actionNote.trim()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-5 py-2.5 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Tolak
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Modul: {(selectedReq as any).module || "-"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Disetujui: {new Date((selectedReq as any).approved_at).toLocaleString("id-ID")}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {actionType === "update_groups" ? (
                        <>
                          <button
                            onClick={() => handleAction("update_groups")}
                            disabled={processing}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors"
                          >
                            <Save className="h-3.5 w-3.5" />
                            Simpan Perubahan
                          </button>
                          <button
                            onClick={() => {
                              setActionType(null);
                              const ids = (selectedReq as any).access_group_ids;
                              if (ids) setSelectedGroupIds(ids);
                            }}
                            className="rounded-lg border bg-white px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            Batal
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setActionType("update_groups")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            Ubah Grup Akses
                          </button>

                          <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                            <input
                              type="text"
                              placeholder="Alasan cabut akses (Wajib)..."
                              value={actionNote}
                              onChange={(e) => setActionNote(e.target.value)}
                              className="flex-1 rounded-lg border bg-white px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                            />
                            <button
                              onClick={() => handleAction("revoke")}
                              disabled={processing || !actionNote.trim()}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50 shrink-0"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                              Cabut Akses
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed py-24 text-center bg-white shadow-sm flex flex-col items-center justify-center">
              <UserCheck className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="font-semibold text-gray-900">Pilih Permintaan</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                Pilih salah satu permintaan di sebelah kiri untuk meninjau
                penugasan grup akses atau membuat keputusan approval.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
