import { useState, useEffect, useCallback } from "react";
import {
  UserCheck,
  ShieldCheck,
  XCircle,
  Search,
  Save,
  Check,
  ShieldAlert,
  UserMinus,
  Settings,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import type {
  PendingLeaderRequest,
  ApprovedLeaderAccess,
} from "@trainers/types";
import {
  AccessModuleBadge,
  getAccessModulePresentation,
} from "./components/AccessModuleBadge";
import {
  groupLeaderAccessRequests,
  resolveDefaultRequest,
} from "./access-approval-grouping";
import type { LeaderAccessRequestGroup } from "./access-approval-grouping";

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

  const [selectedLeaderUserId, setSelectedLeaderUserId] = useState<
    string | null
  >(null);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [actionNote, setActionNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [actionType, setActionType] = useState<
    "approve" | "reject" | "revoke" | "update_groups" | null
  >(null);

  const requests =
    activeTab === "pending" ? pendingRequests || [] : approvedRequests || [];

  const groupedRequests = groupLeaderAccessRequests(requests);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredGroups = normalizedSearch
    ? groupedRequests.filter((group) => {
        const searchableText = [
          group.leaderName,
          group.leaderEmail,
          group.moduleLabel,
          ...group.requests.flatMap((r) => {
            const p = getAccessModulePresentation(r.module);
            return [p.label, p.searchTerms];
          }),
          ...group.accessGroupNames,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchableText.includes(normalizedSearch);
      })
    : groupedRequests;

  const selectedGroup = groupedRequests.find(
    (g) => g.leaderUserId === selectedLeaderUserId,
  );
  const selectedReq = selectedGroup?.requests.find(
    (r) => r.id === selectedReqId,
  );

  const selectedModuleLabel = selectedReq
    ? getAccessModulePresentation(selectedReq.module).label
    : "";

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

  // Reconciliation effect: when groupedRequests change (after refetch)
  useEffect(() => {
    if (!selectedLeaderUserId) return;

    const refreshedGroup = groupedRequests.find(
      (g) => g.leaderUserId === selectedLeaderUserId,
    );

    if (!refreshedGroup) {
      setSelectedLeaderUserId(null);
      setSelectedReqId(null);
      return;
    }

    const nextRequest = resolveDefaultRequest(refreshedGroup, selectedReqId);
    if (nextRequest.id !== selectedReqId) {
      setSelectedReqId(nextRequest.id);
    }
  }, [groupedRequests, selectedLeaderUserId, selectedReqId]);

  const handleSelectLeader = useCallback(
    (group: LeaderAccessRequestGroup) => {
      setSelectedLeaderUserId(group.leaderUserId);
      const defaultReq = resolveDefaultRequest(group, selectedReqId);
      setSelectedReqId(defaultReq.id);
    },
    [selectedReqId],
  );

  const handleSelectModule = useCallback((requestId: string) => {
    setSelectedReqId(requestId);
  }, []);

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
    if (!selectedReqId || !selectedReq) return;

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
        await unwrapResponse(
          await adminClient["leader-requests"][":id"]["approve"].$post({
            param: { id: selectedReqId },
            json: { accessGroupIds: selectedGroupIds },
          }),
        );
        notify.success(
          `Permintaan akses ${selectedModuleLabel} berhasil disetujui`,
        );
      } else if (type === "reject") {
        await unwrapResponse(
          await adminClient["leader-requests"][":id"]["reject"].$post({
            param: { id: selectedReqId },
            json: { note: actionNote },
          }),
        );
        notify.success(
          `Permintaan akses ${selectedModuleLabel} berhasil ditolak`,
        );
      } else if (type === "revoke") {
        await unwrapResponse(
          await adminClient["leader-requests"][":id"]["revoke"].$post({
            param: { id: selectedReqId },
            json: { note: actionNote },
          }),
        );
        notify.success(`Akses ${selectedModuleLabel} berhasil dicabut`);
      } else if (type === "update_groups") {
        await unwrapResponse(
          await adminClient["leader-requests"][":id"].groups.$put({
            param: { id: selectedReqId },
            json: { accessGroupIds: selectedGroupIds },
          }),
        );
        notify.success(`Grup akses ${selectedModuleLabel} berhasil diperbarui`);
      }

      setSelectedReqId(null);
      setSelectedLeaderUserId(null);
      if (activeTab === "pending") {
        await refetchPending();
      } else {
        await refetchApproved();
      }
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal memproses aksi."));
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
                setSelectedLeaderUserId(null);
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
        {/* Left Side: Grouped Requests List */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama, email, atau modul..."
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
            ) : filteredGroups.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <UserCheck className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                <p className="text-xs font-semibold">Tidak ada permintaan</p>
              </div>
            ) : (
              filteredGroups.map((group) => {
                const timestamps = group.requests.map((r) =>
                  "created_at" in r ? r.created_at : r.approved_at,
                );
                const uniqueTimestamps = new Set(timestamps);
                const showLatest =
                  group.requests.length > 1 && uniqueTimestamps.size > 1;

                return (
                  <button
                    key={group.leaderUserId}
                    onClick={() => handleSelectLeader(group)}
                    className={`w-full text-left rounded-xl p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                      selectedLeaderUserId === group.leaderUserId
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm truncate">
                        {group.leaderName || "Tanpa Nama"}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-gray-400">
                        {showLatest && (
                          <span className="font-semibold">Terbaru</span>
                        )}
                        {new Date(group.latestTimestamp).toLocaleDateString(
                          "id-ID",
                        )}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400 truncate font-normal">
                      {group.leaderEmail}
                    </p>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                      <AccessModuleBadge label={group.moduleLabel} />
                    </div>
                    {group.requests.length > 1 && (
                      <p className="mt-1 text-[10px] text-gray-400">
                        {group.requests.length} permintaan
                      </p>
                    )}
                    {group.accessGroupNames.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {group.accessGroupNames.slice(0, 2).map((name, i) => (
                          <span
                            key={i}
                            className="rounded bg-indigo-100/50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700"
                          >
                            {name}
                          </span>
                        ))}
                        {group.accessGroupNames.length > 2 && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-500">
                            +{group.accessGroupNames.length - 2} grup
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Request Action Panel */}
        <div className="space-y-6">
          {selectedGroup && selectedReq ? (
            <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-6">
              {/* Header Info */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedReq.leader_name || "Tanpa Nama"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {selectedReq.leader_email}
                  </p>
                  <p className="mt-2 text-xs text-gray-400">
                    {"created_at" in selectedReq
                      ? `Diminta pada: ${new Date(selectedReq.created_at).toLocaleString("id-ID")}`
                      : `Disetujui pada: ${new Date((selectedReq as ApprovedLeaderAccess).approved_at).toLocaleString("id-ID")}`}
                  </p>
                </div>
                <div>
                  {"status" in selectedReq ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                        selectedReq.status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : selectedReq.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {selectedReq.status}
                    </span>
                  ) : (
                    <span className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                      Approved
                    </span>
                  )}
                </div>
              </div>

              {/* Module Switcher */}
              {selectedGroup.requests.length > 1 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Akses Modul
                  </p>
                  <div
                    role="group"
                    aria-label="Pilih request modul"
                    className="grid grid-cols-2 gap-2"
                  >
                    {selectedGroup.requests.map((request) => {
                      const presentation = getAccessModulePresentation(
                        request.module,
                      );
                      const active = request.id === selectedReqId;
                      return (
                        <button
                          key={request.id}
                          type="button"
                          role="button"
                          aria-pressed={active}
                          aria-label={`Pilih request ${presentation.label}`}
                          onClick={() => handleSelectModule(request.id)}
                          className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                            active
                              ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600"
                              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`}
                        >
                          {presentation.label}
                        </button>
                      );
                    })}
                  </div>
                  {selectedGroup.requests.some((r) => r.module === "all") &&
                    selectedGroup.requests.length > 1 && (
                      <p className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1">
                        Coverage akses tumpang tindih. Tinjau setiap request
                        sebelum melakukan aksi.
                      </p>
                    )}
                </div>
              )}

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
                          ("status" in selectedReq &&
                            selectedReq.status !== "pending" &&
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
                {"status" in selectedReq && selectedReq.status === "pending" ? (
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
                          Setujui Akses {selectedModuleLabel}
                        </button>
                        <button
                          onClick={() => handleAction("reject")}
                          disabled={processing || !actionNote.trim()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-5 py-2.5 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Tolak {selectedModuleLabel}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Modul: {selectedModuleLabel}
                      </p>
                      <p className="text-xs text-gray-500">
                        Disetujui:{" "}
                        {new Date(
                          (selectedReq as ApprovedLeaderAccess).approved_at,
                        ).toLocaleString("id-ID")}
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
                              const ids = (selectedReq as ApprovedLeaderAccess).access_group_ids;
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
                            Ubah Grup Akses {selectedModuleLabel}
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
                              Cabut Akses {selectedModuleLabel}
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
