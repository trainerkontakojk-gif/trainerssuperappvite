import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import type {
  AccessGroupItemRow,
  AccessGroupRow,
  AccessScopeOptions,
} from "@trainers/types";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { GroupSidebar } from "./components/access-groups/GroupSidebar";
import { RuleList } from "./components/access-groups/RuleList";
import { RULE_TYPE_LABELS } from "./components/access-groups/ruleLabels";
import { RuleBuilderForm } from "./components/access-groups/RuleBuilderForm";
import { ManagementShell } from "./components/management/ManagementShell";
import { StatusDot } from "./components/management/StatusDot";
import { ConfirmDialog } from "./components/management/ConfirmDialog";
import { EmptyState } from "./components/management/EmptyState";
import { SplitView } from "./components/management/SplitView";

type RuleType = "tim" | "service_type" | "batch_name" | "peserta_id";

type RuleFieldName = AccessGroupItemRow["field_name"];

interface TeamRuleOption {
  value: string;
  label: string;
  kind: "team" | "batch";
}

interface TeamRuleOptionGroup {
  team: string;
  options: TeamRuleOption[];
}

const TEAM_RULE_PREFIX = "tim:";
const BATCH_RULE_PREFIX = "batch_name:";

function encodeTeamRuleOption(fieldName: "tim" | "batch_name", value: string) {
  const prefix = fieldName === "tim" ? TEAM_RULE_PREFIX : BATCH_RULE_PREFIX;
  return `${prefix}${encodeURIComponent(value)}`;
}

function decodeTeamRuleOption(value: string): {
  fieldName: "tim" | "batch_name";
  fieldValue: string;
} {
  if (value.startsWith(BATCH_RULE_PREFIX)) {
    return {
      fieldName: "batch_name",
      fieldValue: decodeURIComponent(value.slice(BATCH_RULE_PREFIX.length)),
    };
  }

  if (value.startsWith(TEAM_RULE_PREFIX)) {
    return {
      fieldName: "tim",
      fieldValue: decodeURIComponent(value.slice(TEAM_RULE_PREFIX.length)),
    };
  }

  return { fieldName: "tim", fieldValue: value };
}

export default function AccessGroupsPage() {
  const {
    data: groups,
    loading: loadingGroups,
    refetch: refetchGroups,
  } = useApi<AccessGroupRow[]>("/admin/access-groups");
  const { data: scopeOptions } = useApi<AccessScopeOptions>(
    "/admin/access-scope-options",
  );

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const {
    data: selectedGroupItems,
    loading: loadingItems,
    refetch: refetchItems,
  } = useApi<AccessGroupItemRow[]>(
    selectedGroupId ? `/admin/access-groups/${selectedGroupId}/items` : null,
  );

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");

  // Group Create/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AccessGroupRow | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupIsActive, setGroupIsActive] = useState(true);
  const [savingGroup, setSavingGroup] = useState(false);

  // New Rule State — guided builder
  const [ruleType, setRuleType] = useState<RuleType>("tim");
  const [ruleValue, setRuleValue] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const [addingRule, setAddingRule] = useState(false);

  const [pendingDeleteRule, setPendingDeleteRule] =
    useState<AccessGroupItemRow | null>(null);
  const [deletingRule, setDeletingRule] = useState(false);
  const nameId = useId();
  const descriptionId = useId();
  const activeId = useId();

  // Di layar lebar, buka grup pertama sekali saat data datang. Di ponsel daftar
  // dan detail tampil bergantian, jadi pilihan otomatis akan menyembunyikan daftar.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || !groups?.length) return;
    autoSelected.current = true;
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSelectedGroupId((current) => current ?? groups[0].id);
    }
  }, [groups]);

  const handleOpenCreateModal = () => {
    setEditingGroup(null);
    setGroupName("");
    setGroupDescription("");
    setGroupIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (group: AccessGroupRow) => {
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
        await unwrapResponse(
          await adminClient["access-groups"][":id"].$put({
            param: { id: editingGroup.id },
            json: {
              name: groupName,
              description: groupDescription,
              is_active: groupIsActive,
            },
          }),
        );
        notify.success("Grup akses berhasil diperbarui");
      } else {
        const newGroup = await unwrapResponse(
          await adminClient["access-groups"].$post({
            json: { name: groupName, description: groupDescription },
          }),
        );
        notify.success("Grup akses berhasil dibuat");
        setSelectedGroupId(newGroup.id);
      }
      setIsModalOpen(false);
      await refetchGroups();
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal menyimpan grup akses."));
    } finally {
      setSavingGroup(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !ruleType || !ruleValue) return;

    const resolvedRule: { fieldName: RuleFieldName; fieldValue: string } =
      ruleType === "tim"
        ? decodeTeamRuleOption(ruleValue)
        : { fieldName: ruleType, fieldValue: ruleValue };

    setAddingRule(true);
    try {
      await unwrapResponse(
        await adminClient["access-groups"][":id"].items.$post({
          param: { id: selectedGroupId },
          json: resolvedRule,
        }),
      );
      setRuleValue("");
      await Promise.all([refetchItems(), refetchGroups()]);
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal menambahkan aturan akses."));
    } finally {
      setAddingRule(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!pendingDeleteRule) return;
    setDeletingRule(true);
    try {
      await unwrapResponse(
        await adminClient["access-groups"].items[":itemId"].$delete({
          param: { itemId: pendingDeleteRule.id },
        }),
      );
      setPendingDeleteRule(null);
      await Promise.all([refetchItems(), refetchGroups()]);
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal menghapus aturan akses."));
    } finally {
      setDeletingRule(false);
    }
  };

  const filteredGroups = useMemo(() => {
    return (groups || []).filter(
      (g) =>
        g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (g.description &&
          g.description.toLowerCase().includes(searchTerm.toLowerCase())),
    );
  }, [groups, searchTerm]);

  const selectedGroup = (groups || []).find((g) => g.id === selectedGroupId);

  const agentList = scopeOptions?.agentsByTeam[filterTeam] || [];
  const teamRuleOptionGroups: TeamRuleOptionGroup[] = useMemo(() => {
    const teams = scopeOptions?.teams || [];
    const agentsByTeam = scopeOptions?.agentsByTeam || {};

    return teams.map((team) => {
      const batchNames = new Set<string>();
      for (const agent of agentsByTeam[team] || []) {
        const batchName = agent.batch_name?.trim();
        if (batchName) batchNames.add(batchName);
      }

      return {
        team,
        options: [
          {
            value: encodeTeamRuleOption("tim", team),
            label: `${team} — Semua subfolder`,
            kind: "team",
          },
          ...[...batchNames]
            .sort((left, right) => left.localeCompare(right))
            .map((batchName) => ({
              value: encodeTeamRuleOption("batch_name", batchName),
              label: batchName,
              kind: "batch" as const,
            })),
        ],
      };
    });
  }, [scopeOptions]);

  const teamRuleValueLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const group of teamRuleOptionGroups) {
      for (const option of group.options) {
        labels.set(option.value, option.label);
      }
    }
    return labels;
  }, [teamRuleOptionGroups]);

  const ruleValueOptions: string[] = useMemo(() => {
    if (ruleType === "tim")
      return teamRuleOptionGroups.flatMap((group) =>
        group.options.map((option) => option.value),
      );
    if (ruleType === "service_type")
      return (scopeOptions?.services || []).map((s) => s.value);
    if (ruleType === "peserta_id") {
      if (filterTeam) return agentList.map((a) => a.id);
      return [];
    }
    return [];
  }, [ruleType, filterTeam, scopeOptions, agentList, teamRuleOptionGroups]);

  const getRuleValueLabel = (type: string, val: string): string => {
    if (type === "tim") {
      // Item tersimpan memakai nama tim mentah; opsi builder memakai nilai ter-encode.
      return teamRuleValueLabels.get(encodeTeamRuleOption("tim", val)) || val;
    }
    if (type === "peserta_id") {
      for (const agents of Object.values(scopeOptions?.agentsByTeam || {})) {
        const found = agents.find((a) => a.id === val);
        if (found) return found.name;
      }
      return val;
    }
    if (type === "batch_name") return val;
    if (type === "service_type") {
      const svc = (scopeOptions?.services || []).find((s) => s.value === val);
      return svc?.label || val;
    }
    return val;
  };

  const selectedActive = selectedGroup?.is_active !== false;

  return (
    <ManagementShell
      title="Grup Akses"
      description="Tentukan data peserta yang boleh dilihat leader. Grup dipilih saat menyetujui permintaan akses."
      actions={
        <Button className="h-11 sm:h-9" onClick={handleOpenCreateModal}>
          <Plus aria-hidden="true" />
          Buat grup
        </Button>
      }
    >
      <SplitView
        onBack={() => setSelectedGroupId(null)}
        list={
          <GroupSidebar
            groups={filteredGroups}
            loading={loadingGroups}
            selectedGroupId={selectedGroupId}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onSelectGroup={setSelectedGroupId}
          />
        }
        detail={
          selectedGroup ? (
            <div className="flex flex-col gap-6 p-5 lg:p-6">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                      {selectedGroup.name}
                    </h2>
                    <p className="mt-1 max-w-prose text-sm text-pretty text-muted-foreground">
                      {selectedGroup.description || "Belum ada deskripsi."}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusDot
                      tone={selectedActive ? "success" : "muted"}
                      label={selectedActive ? "Aktif" : "Nonaktif"}
                    />
                    <Button
                      variant="outline"
                      className="h-11 sm:h-8"
                      onClick={() => handleOpenEditModal(selectedGroup)}
                    >
                      Edit grup
                    </Button>
                  </div>
                </div>
              </div>

              <RuleList
                groupName={selectedGroup.name}
                items={selectedGroupItems || []}
                loading={loadingItems}
                onDelete={setPendingDeleteRule}
                getRuleValueLabel={getRuleValueLabel}
              />

              <RuleBuilderForm
                scopeOptions={scopeOptions}
                ruleType={ruleType}
                onRuleTypeChange={(val) => {
                  setRuleType(val);
                  setRuleValue("");
                  setFilterTeam("");
                }}
                ruleValue={ruleValue}
                onRuleValueChange={setRuleValue}
                filterTeam={filterTeam}
                onFilterTeamChange={(val) => {
                  setFilterTeam(val);
                  setRuleValue("");
                }}
                teamRuleOptionGroups={teamRuleOptionGroups}
                addingRule={addingRule}
                onSubmit={handleAddRule}
                getRuleValueLabel={getRuleValueLabel}
                ruleValueOptions={ruleValueOptions}
              />
            </div>
          ) : null
        }
        empty={
          <EmptyState
            title="Pilih grup akses"
            description="Pilih grup di daftar untuk melihat dan mengatur data yang boleh diakses leader."
          />
        }
      />

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="gap-5 p-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-semibold tracking-tight">
              {editingGroup ? "Edit grup akses" : "Grup akses baru"}
            </DialogTitle>
            <DialogDescription>
              Nama grup tampil saat menyetujui permintaan akses leader.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveGroup} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={nameId}>Nama grup</Label>
              <Input
                id={nameId}
                required
                placeholder="Contoh: Tim Java"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="h-11 sm:h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={descriptionId}>Deskripsi</Label>
              <Textarea
                id={descriptionId}
                placeholder="Untuk siapa grup ini dipakai?"
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                rows={3}
              />
            </div>
            {editingGroup ? (
              <div className="flex items-center gap-2">
                <input
                  id={activeId}
                  type="checkbox"
                  checked={groupIsActive}
                  onChange={(e) => setGroupIsActive(e.target.checked)}
                  className="size-4 accent-foreground"
                />
                <Label htmlFor={activeId}>Grup aktif</Label>
              </div>
            ) : null}
            <DialogFooter className="-mx-5 -mb-5 px-5">
              <Button
                type="button"
                variant="outline"
                className="h-11 sm:h-9"
                onClick={() => setIsModalOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                className="h-11 sm:h-9"
                disabled={savingGroup || !groupName.trim()}
              >
                {editingGroup ? "Simpan perubahan" : "Buat grup"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDeleteRule !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteRule(null);
        }}
        title="Hapus aturan?"
        description={
          pendingDeleteRule
            ? `Leader di grup ini tidak lagi melihat data dengan ${RULE_TYPE_LABELS[pendingDeleteRule.field_name] ?? pendingDeleteRule.field_name} ${getRuleValueLabel(pendingDeleteRule.field_name, pendingDeleteRule.field_value)}.`
            : ""
        }
        confirmLabel="Hapus aturan"
        tone="destructive"
        pending={deletingRule}
        onConfirm={handleDeleteRule}
      />
    </ManagementShell>
  );
}
