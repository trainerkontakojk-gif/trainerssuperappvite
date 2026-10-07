import { useCallback, useEffect, useId, useState } from "react";
import { cn } from "cn";
import type {
  ApprovedLeaderAccess,
  PendingLeaderRequest,
} from "@trainers/types";
import { useApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Skeleton } from "../../components/ui/skeleton";
import { Textarea } from "../../components/ui/textarea";
import { getAccessModulePresentation } from "./components/AccessModuleBadge";
import {
  groupLeaderAccessRequests,
  resolveDefaultRequest,
  type LeaderAccessRequest,
  type LeaderAccessRequestGroup,
} from "./access-approval-grouping";
import { ManagementShell } from "./components/management/ManagementShell";
import { SearchField } from "./components/management/SearchField";
import { SegmentedFilter } from "./components/management/SegmentedFilter";
import { StatusDot } from "./components/management/StatusDot";
import { ConfirmDialog } from "./components/management/ConfirmDialog";
import { EmptyState } from "./components/management/EmptyState";
import { SplitView, SplitViewItem } from "./components/management/SplitView";

interface AccessGroup {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean | null;
}

type Tab = "pending" | "approved";
type ActionType = "approve" | "reject" | "revoke" | "update_groups";

function requestTimestamp(request: LeaderAccessRequest) {
  return "created_at" in request ? request.created_at : request.approved_at;
}

function formatDate(value: string, withTime = false) {
  return new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function isPending(
  request: LeaderAccessRequest,
): request is PendingLeaderRequest {
  return "status" in request && request.status === "pending";
}

export default function AccessApprovalPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [searchTerm, setSearchTerm] = useState("");

  const pending = useApi<PendingLeaderRequest[]>(
    activeTab === "pending" ? "/admin/leader-requests/pending" : null,
  );
  const approved = useApi<ApprovedLeaderAccess[]>(
    activeTab === "approved" ? "/admin/leader-requests/approved" : null,
  );
  const { data: groups } = useApi<AccessGroup[]>("/admin/access-groups");
  const active = activeTab === "pending" ? pending : approved;

  const [selectedLeaderUserId, setSelectedLeaderUserId] = useState<
    string | null
  >(null);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [rejectNote, setRejectNote] = useState("");
  const [editingGroups, setEditingGroups] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const noteId = useId();

  const groupedRequests = groupLeaderAccessRequests(active.data ?? []);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredGroups = normalizedSearch
    ? groupedRequests.filter((group) =>
        [
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
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : groupedRequests;

  const selectedGroup = groupedRequests.find(
    (g) => g.leaderUserId === selectedLeaderUserId,
  );
  const selectedReq = selectedGroup?.requests.find(
    (r) => r.id === selectedReqId,
  );
  const moduleLabel = selectedReq
    ? getAccessModulePresentation(selectedReq.module).label
    : "";
  const activeGroups = (groups ?? []).filter((g) => g.is_active !== false);

  // Reset form saat permintaan yang dipilih berganti.
  useEffect(() => {
    setSelectedGroupIds(
      selectedReq && "access_group_ids" in selectedReq
        ? (selectedReq.access_group_ids ?? [])
        : [],
    );
    setRejectNote("");
    setEditingGroups(false);
  }, [selectedReq]);

  // Setelah refetch, pertahankan pilihan bila leader masih ada di daftar.
  useEffect(() => {
    if (!selectedLeaderUserId) return;
    const refreshed = groupedRequests.find(
      (g) => g.leaderUserId === selectedLeaderUserId,
    );
    if (!refreshed) {
      setSelectedLeaderUserId(null);
      setSelectedReqId(null);
      return;
    }
    const next = resolveDefaultRequest(refreshed, selectedReqId);
    if (next.id !== selectedReqId) setSelectedReqId(next.id);
  }, [groupedRequests, selectedLeaderUserId, selectedReqId]);

  const selectLeader = useCallback(
    (group: LeaderAccessRequestGroup) => {
      setSelectedLeaderUserId(group.leaderUserId);
      setSelectedReqId(resolveDefaultRequest(group, selectedReqId).id);
    },
    [selectedReqId],
  );

  const clearSelection = () => {
    setSelectedLeaderUserId(null);
    setSelectedReqId(null);
  };

  const toggleGroup = (groupId: string) =>
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );

  const runAction = async (type: ActionType, note = "") => {
    if (!selectedReq) return;
    const id = selectedReq.id;
    setProcessing(true);
    try {
      if (type === "approve") {
        await unwrapResponse(
          await adminClient["leader-requests"][":id"].approve.$post({
            param: { id },
            json: { accessGroupIds: selectedGroupIds },
          }),
        );
        notify.success(`Akses ${moduleLabel} disetujui`);
      } else if (type === "reject") {
        await unwrapResponse(
          await adminClient["leader-requests"][":id"].reject.$post({
            param: { id },
            json: { note },
          }),
        );
        notify.success(`Permintaan akses ${moduleLabel} ditolak`);
      } else if (type === "revoke") {
        await unwrapResponse(
          await adminClient["leader-requests"][":id"].revoke.$post({
            param: { id },
            json: { note },
          }),
        );
        notify.success(`Akses ${moduleLabel} dicabut`);
        setRevokeOpen(false);
      } else {
        await unwrapResponse(
          await adminClient["leader-requests"][":id"].groups.$put({
            param: { id },
            json: { accessGroupIds: selectedGroupIds },
          }),
        );
        notify.success(`Grup akses ${moduleLabel} diperbarui`);
      }
      clearSelection();
      await active.refetch();
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal memproses aksi."));
    } finally {
      setProcessing(false);
    }
  };

  const pendingSelected = selectedReq ? isPending(selectedReq) : false;
  const groupsEditable = pendingSelected || editingGroups;

  return (
    <ManagementShell
      title="Persetujuan Akses"
      description="Tinjau permintaan akses leader ke modul KTP dan SIDAK, lalu tentukan grup data yang boleh mereka lihat."
    >
      <SegmentedFilter
        label="Status permintaan"
        value={activeTab}
        onChange={(tab) => {
          setActiveTab(tab);
          clearSelection();
        }}
        options={[
          { id: "pending", label: "Menunggu" },
          { id: "approved", label: "Disetujui" },
        ]}
      />

      <SplitView
        onBack={clearSelection}
        list={
          <>
            <div className="border-b border-border p-3">
              <SearchField
                label="Cari leader, email, atau modul"
                value={searchTerm}
                onChange={setSearchTerm}
              />
            </div>
            {active.loading && !active.data ? (
              <div role="status" aria-live="polite" className="grid gap-2 p-3">
                <span className="sr-only">Memuat permintaan…</span>
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredGroups.length === 0 ? (
              <EmptyState
                title={
                  activeTab === "pending"
                    ? "Tidak ada permintaan menunggu"
                    : "Belum ada akses yang disetujui"
                }
                description={
                  normalizedSearch
                    ? "Tidak ada yang cocok dengan pencarian ini."
                    : "Permintaan baru akan muncul di sini."
                }
              />
            ) : (
              <ul className="flex-1 divide-y divide-border overflow-y-auto lg:max-h-[640px]">
                {filteredGroups.map((group) => {
                  const selected = selectedLeaderUserId === group.leaderUserId;
                  return (
                    <SplitViewItem
                      key={group.leaderUserId}
                      selected={selected}
                      onSelect={() => selectLeader(group)}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium text-foreground">
                          {group.leaderName || "Tanpa nama"}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatDate(group.latestTimestamp)}
                        </span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {group.leaderEmail}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Modul {group.moduleLabel}
                        {group.requests.length > 1
                          ? ` · ${group.requests.length} permintaan`
                          : ""}
                      </span>
                    </SplitViewItem>
                  );
                })}
              </ul>
            )}
          </>
        }
        detail={
          selectedGroup && selectedReq ? (
            <>
              <div className="flex flex-1 flex-col gap-6 p-5 lg:p-6">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                        {selectedReq.leader_name || "Tanpa nama"}
                      </h2>
                      <p className="truncate text-sm text-muted-foreground">
                        {selectedReq.leader_email}
                      </p>
                    </div>
                    <StatusDot
                      tone={pendingSelected ? "warning" : "success"}
                      label={pendingSelected ? "Menunggu review" : "Disetujui"}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                    {pendingSelected ? "Diminta" : "Disetujui"}{" "}
                    {formatDate(requestTimestamp(selectedReq), true)}
                  </p>
                </div>

                {selectedGroup.requests.length > 1 ? (
                  <SegmentedFilter
                    label="Modul permintaan"
                    value={selectedReq.id}
                    onChange={setSelectedReqId}
                    options={selectedGroup.requests.map((request) => ({
                      id: request.id,
                      label: getAccessModulePresentation(request.module).label,
                    }))}
                  />
                ) : null}

                <fieldset
                  className="grid gap-3"
                  disabled={!groupsEditable || processing}
                >
                  <legend className="mb-1 text-sm font-semibold text-foreground">
                    Grup akses {moduleLabel}
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    Leader hanya bisa melihat data peserta yang tercakup grup
                    yang dipilih.
                  </p>
                  {activeGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Belum ada grup akses aktif. Buat grup di halaman Grup
                      Akses.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {activeGroups.map((group) => {
                        const checked = selectedGroupIds.includes(group.id);
                        return (
                          <label
                            key={group.id}
                            className={cn(
                              "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors has-disabled:cursor-default",
                              checked
                                ? "border-foreground/40 bg-muted"
                                : "border-border hover:bg-muted/50",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleGroup(group.id)}
                              className="mt-0.5 size-4 accent-foreground"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {group.name}
                              </span>
                              {group.description ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {group.description}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </fieldset>

                {pendingSelected ? (
                  <div className="grid gap-2">
                    <Label htmlFor={noteId}>Catatan penolakan</Label>
                    <Textarea
                      id={noteId}
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      rows={2}
                      placeholder="Wajib diisi bila menolak permintaan."
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-card px-5 py-3 lg:sticky lg:bottom-0 lg:px-6">
                {pendingSelected ? (
                  <>
                    <Button
                      variant="outline"
                      className="h-11 sm:h-9"
                      disabled={processing || !rejectNote.trim()}
                      onClick={() => runAction("reject", rejectNote.trim())}
                    >
                      Tolak
                    </Button>
                    <Button
                      className="h-11 sm:h-9"
                      disabled={processing || selectedGroupIds.length === 0}
                      onClick={() => runAction("approve")}
                    >
                      Setujui akses {moduleLabel}
                    </Button>
                  </>
                ) : editingGroups ? (
                  <>
                    <Button
                      variant="outline"
                      className="h-11 sm:h-9"
                      disabled={processing}
                      onClick={() => {
                        setEditingGroups(false);
                        if ("access_group_ids" in selectedReq) {
                          setSelectedGroupIds(
                            selectedReq.access_group_ids ?? [],
                          );
                        }
                      }}
                    >
                      Batal
                    </Button>
                    <Button
                      className="h-11 sm:h-9"
                      disabled={processing || selectedGroupIds.length === 0}
                      onClick={() => runAction("update_groups")}
                    >
                      Simpan grup
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="destructive"
                      className="h-11 sm:h-9"
                      disabled={processing}
                      onClick={() => setRevokeOpen(true)}
                    >
                      Cabut akses
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 sm:h-9"
                      disabled={processing}
                      onClick={() => setEditingGroups(true)}
                    >
                      Ubah grup
                    </Button>
                  </>
                )}
              </div>
            </>
          ) : null
        }
        empty={
          <EmptyState
            title="Pilih permintaan"
            description="Pilih leader di daftar untuk meninjau grup akses atau membuat keputusan."
          />
        }
      />

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="Cabut akses?"
        description={`Leader kehilangan akses ${moduleLabel} sampai mengajukan permintaan baru.`}
        confirmLabel="Cabut akses"
        tone="destructive"
        reasonLabel="Alasan"
        pending={processing}
        onConfirm={(reason) => runAction("revoke", reason)}
      />
    </ManagementShell>
  );
}
