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
import { StaggerList, StaggerItem } from "../../components/motion";
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
    <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 py-8 lg:px-10 lg:py-16">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg3">
            <UserCheck className="h-3.5 w-3.5 text-fg2" />
            Verification Center
          </div>
          <h2 className="mt-2 text-3xl font-bold font-display tracking-tight text-fg">
            Persetujuan Akses
          </h2>
          <p className="mt-1 text-fg2 text-sm max-w-lg">
            Review permintaan hak akses kepemimpinan (Leader) dan petakan
            wilayah data mereka.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
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
              className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150 ${
                activeTab === tab.id
                  ? "bg-bg text-fg border border-border"
                  : "text-fg2 hover:bg-bg/50 hover:text-fg border border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="border border-border bg-surface rounded-xl overflow-hidden min-h-[600px] grid lg:grid-cols-[360px_1fr]">
        {/* Left Side: Grouped Requests List */}
        <div className="border-r border-border p-5 flex flex-col gap-4 bg-bg/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg3" />
            <input
              type="text"
              placeholder="Cari nama, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-border bg-bg pl-10 pr-4 py-2 text-sm text-fg placeholder:text-fg3 focus:border-fg focus:outline-none transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[550px]">
            {(activeTab === "pending" ? loadingPending : loadingApproved) ? (
              <div className="flex flex-col items-center justify-center py-20 text-fg3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-fg" />
                <span className="mt-2 text-xs font-medium uppercase tracking-wider opacity-50">
                  Memproses...
                </span>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="py-20 text-center text-fg3 font-mono text-xs">
                <UserCheck className="mx-auto h-8 w-8 text-fg3 mb-3 opacity-20" />
                <span>// TIDAK ADA PERMINTAAN</span>
              </div>
            ) : (
              <StaggerList className="space-y-1">
                {filteredGroups.map((group) => {
                  const timestamps = group.requests.map((r) =>
                    "created_at" in r ? r.created_at : r.approved_at,
                  );
                  const uniqueTimestamps = new Set(timestamps);
                  const showLatest =
                    group.requests.length > 1 && uniqueTimestamps.size > 1;

                  const isSelected = selectedLeaderUserId === group.leaderUserId;

                  return (
                    <StaggerItem key={group.leaderUserId}>
                      <button
                        onClick={() => handleSelectLeader(group)}
                        className={`w-full text-left rounded-lg p-3.5 border transition-all duration-150 focus-visible:outline-none ${
                          isSelected
                            ? "bg-bg text-fg border-border"
                            : "border-transparent text-fg2 hover:bg-bg/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold text-sm truncate ${isSelected ? 'text-fg' : 'text-fg2'}`}>
                            {group.leaderName || "Tanpa Nama"}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-fg3 font-medium">
                            {showLatest && (
                              <span className="font-bold text-fg/60">LATEST</span>
                            )}
                            {new Date(group.latestTimestamp).toLocaleDateString(
                              "id-ID",
                            )}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-fg3 truncate font-normal">
                          {group.leaderEmail}
                        </p>
                        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
                          <AccessModuleBadge label={group.moduleLabel} />
                        </div>
                        {group.requests.length > 1 && (
                          <p className="mt-2 text-[10px] font-bold text-fg3 uppercase tracking-tighter opacity-60">
                            {group.requests.length} Permintaan
                          </p>
                        )}
                      </button>
                    </StaggerItem>
                  );
                })}
              </StaggerList>
            )}
          </div>
        </div>

        {/* Right Side: Request Action Panel */}
        <div className="p-8 flex flex-col justify-start">
          {selectedGroup && selectedReq ? (
            <div className="space-y-8">
              {/* Header Info */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
                <div>
                  <h3 className="text-2xl font-bold font-display tracking-tight text-fg">
                    {selectedReq.leader_name || "Tanpa Nama"}
                  </h3>
                  <p className="mt-1 text-sm text-fg2 font-medium">
                    {selectedReq.leader_email}
                  </p>
                  <p className="mt-2 text-[10px] text-fg3 font-bold uppercase tracking-widest">
                    {"created_at" in selectedReq
                      ? `Diminta: ${new Date(selectedReq.created_at).toLocaleString("id-ID")}`
                      : `Disetujui: ${new Date((selectedReq as ApprovedLeaderAccess).approved_at).toLocaleString("id-ID")}`}
                  </p>
                </div>
                <div>
                  {"status" in selectedReq ? (
                    <span
                      className={`rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border ${
                        selectedReq.status === "pending"
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
                          : selectedReq.status === "approved"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                            : "border-red-500/20 bg-red-500/10 text-red-500"
                      }`}
                    >
                      {selectedReq.status}
                    </span>
                  ) : (
                    <span className="rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                      Approved
                    </span>
                  )}
                </div>
              </div>

              {/* Module Switcher */}
              {selectedGroup.requests.length > 1 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-fg3 uppercase tracking-wider">
                    Akses Modul
                  </p>
                  <div
                    role="group"
                    aria-label="Pilih request modul"
                    className="flex flex-wrap gap-2"
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
                          className={`min-h-9 rounded-md border px-4 py-1.5 text-xs font-semibold transition-all duration-150 ${
                            active
                              ? "border-fg bg-bg text-fg"
                              : "border-border bg-surface text-fg2 hover:bg-bg/40 hover:text-fg"
                          }`}
                        >
                          {presentation.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Access Scope Settings */}
              <div className="space-y-5">
                <div>
                  <h4 className="text-sm font-bold text-fg flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-fg2" />
                    Penugasan Wilayah Kerja
                  </h4>
                  <p className="text-xs text-fg2 mt-1">
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
                        className={`flex items-start text-left gap-3 rounded-lg border p-4 transition-all duration-150 ${
                          isChecked
                            ? "border-fg bg-bg text-fg"
                            : "border-border bg-surface text-fg2 hover:bg-bg/40"
                        } disabled:opacity-70`}
                      >
                        <div
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
                            isChecked
                              ? "border-fg bg-fg text-bg"
                              : "border-border bg-transparent"
                          }`}
                        >
                          {isChecked && (
                            <Check className="h-3 w-3 stroke-[3.5]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-xs text-fg block truncate">
                            {group.name}
                          </span>
                          {group.description && (
                            <p className="text-[10px] text-fg3 line-clamp-1 mt-0.5 font-medium">
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
              <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
                {"status" in selectedReq && selectedReq.status === "pending" ? (
                  <>
                    <div className="flex items-center gap-2 text-[11px] font-bold text-fg2 uppercase tracking-wider">
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      Keputusan Approval
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-fg3 uppercase tracking-wider block mb-2">
                          Catatan Internal / Alasan Penolakan
                        </label>
                        <textarea
                          placeholder="Tulis alasan jika menolak permintaan..."
                          value={actionNote}
                          onChange={(e) => setActionNote(e.target.value)}
                          rows={2}
                          className="w-full rounded-md border border-border bg-bg px-4 py-2.5 text-sm text-fg placeholder:text-fg3 focus:outline-none focus:border-fg resize-none transition-all"
                        />
                      </div>

                      <div className="flex flex-wrap gap-3 pt-1">
                        <button
                          onClick={() => handleAction("approve")}
                          disabled={processing || selectedGroupIds.length === 0}
                          className="inline-flex items-center gap-1.5 rounded-md bg-inv-bg px-5 py-2.5 text-xs font-semibold text-inv-fg hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <Check className="h-4 w-4" />
                          Setujui Akses {selectedModuleLabel}
                        </button>
                        <button
                          onClick={() => handleAction("reject")}
                          disabled={processing || !actionNote.trim()}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-5 py-2.5 text-xs font-semibold text-fg2 hover:bg-surface hover:text-red-500 transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <XCircle className="h-4 w-4" />
                          Tolak
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between border-b border-border pb-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-fg3">
                        Modul: {selectedModuleLabel}
                      </p>
                      <p className="text-xs text-fg3 font-medium">
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
                            className="inline-flex items-center gap-1.5 rounded-md bg-inv-bg px-5 py-2.5 text-xs font-semibold text-inv-fg hover:opacity-90 transition-all cursor-pointer"
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
                            className="rounded-md border border-border bg-transparent px-5 py-2.5 text-xs font-semibold text-fg2 hover:bg-surface transition-colors cursor-pointer"
                          >
                            Batal
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setActionType("update_groups")}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-5 py-2.5 text-xs font-semibold text-fg hover:bg-bg transition-colors cursor-pointer"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            Ubah Grup Akses
                          </button>

                          <div className="flex gap-2 w-full sm:w-auto">
                            <input
                              type="text"
                              placeholder="Alasan cabut akses (Wajib)..."
                              value={actionNote}
                              onChange={(e) => setActionNote(e.target.value)}
                              className="flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-fg placeholder:text-fg3 focus:outline-none focus:border-fg transition-all"
                            />
                            <button
                              onClick={() => handleAction("revoke")}
                              disabled={processing || !actionNote.trim()}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-4 py-2.5 text-xs font-semibold text-fg2 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all disabled:opacity-50 shrink-0 cursor-pointer"
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
            <div className="flex-1 flex flex-col items-center justify-center text-center py-24">
              <UserCheck className="h-12 w-12 text-fg3 mb-4 opacity-10" />
              <h3 className="font-bold text-fg font-display text-xl tracking-tight">Pilih Permintaan</h3>
              <p className="text-xs text-fg2 mt-2 max-w-[280px] leading-relaxed">
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
