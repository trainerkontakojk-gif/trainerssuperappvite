import { useState, useEffect, useMemo } from "react";
import {
  Layers,
  Plus,
  Settings,
  Check,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { adminClient, getErrorMessage, unwrapResponse } from "../../lib/api";
import { notify } from "../../lib/toast";
import type {
  AccessGroupItemRow,
  AccessGroupRow,
  AccessScopeOptions,
} from "@trainers/types";

// Extracted Components
import { GroupSidebar } from "./components/access-groups/GroupSidebar";
import { RuleList } from "./components/access-groups/RuleList";
import { RuleBuilderForm } from "./components/access-groups/RuleBuilderForm";

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

  // Select first group automatically when groups load
  useEffect(() => {
    if (groups && groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

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
      await refetchItems();
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal menambahkan aturan akses."));
    } finally {
      setAddingRule(false);
    }
  };

  const handleDeleteRule = async (itemId: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus aturan akses ini?")) return;

    try {
      await unwrapResponse(
        await adminClient["access-groups"].items[":itemId"].$delete({
          param: { itemId },
        }),
      );
      await refetchItems();
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, "Gagal menghapus aturan akses."));
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
      return teamRuleValueLabels.get(val) || val;
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

  return (
    <div className="p-4 lg:p-8 max-w-[var(--content-max-width)] mx-auto space-y-10 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
            <Layers className="h-3.5 w-3.5" />
            Access Scopes Builder
          </div>
          <h1 className="mt-3 text-page-title font-display text-foreground">
            Grup Akses
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Definisikan batasan wilayah kerja (skup data) untuk Leader
            berdasarkan kriteria dinamis untuk memastikan keamanan dan privasi data.
          </p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Plus className="h-4 w-4" />
          Buat Grup Baru
        </button>
      </div>

      {/* Main Layout: Master-Detail Split */}
      <div className="grid gap-10 lg:grid-cols-[340px_1fr]">
        {/* Left Side: Groups List */}
        <GroupSidebar
          groups={filteredGroups}
          loading={loadingGroups}
          selectedGroupId={selectedGroupId}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onSelectGroup={setSelectedGroupId}
        />

        {/* Right Side: Group Rules Builder */}
        <div className="space-y-8">
          {selectedGroup ? (
            <div className="rounded-3xl border border-border bg-card p-8 shadow-sm space-y-10 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary/40" />
              
              {/* Header Group Details */}
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <h3 className="text-2xl font-bold font-display text-foreground tracking-tight">
                    {selectedGroup.name}
                  </h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed max-w-xl">
                    {selectedGroup.description || "Grup ini belum memiliki deskripsi detail."}
                  </p>
                </div>
                <button
                  onClick={() => handleOpenEditModal(selectedGroup)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted transition-all shadow-sm"
                >
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                  Pengaturan Grup
                </button>
              </div>

              {/* Rules List Section */}
              <RuleList
                items={selectedGroupItems || []}
                loading={loadingItems}
                onDelete={handleDeleteRule}
                getRuleValueLabel={getRuleValueLabel}
              />

              {/* Add Rule Form Section */}
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
          ) : (
            <div className="rounded-3xl border border-dashed border-border py-32 text-center bg-card shadow-sm flex flex-col items-center justify-center animate-pulse-slow">
              <Layers className="h-16 w-16 text-muted-foreground/20 mb-6" />
              <h3 className="text-lg font-bold font-display text-foreground/80">Pilih Grup Akses</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                Pilih salah satu grup akses di sebelah kiri untuk mengelola batasan data yang dapat diakses oleh Leader.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Group Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold font-display text-foreground mb-2">
              {editingGroup ? "Edit Grup Akses" : "Grup Akses Baru"}
            </h3>
            <p className="text-xs text-muted-foreground mb-8">
              Nama grup membantu identifikasi cepat saat proses persetujuan akses Leader.
            </p>

            <form onSubmit={handleSaveGroup} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
                  Nama Grup
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Tim Java, Area Jabodetabek"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
                  Deskripsi Singkat
                </label>
                <textarea
                  placeholder="Jelaskan peruntukan grup akses ini..."
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all resize-none"
                />
              </div>

              {editingGroup && (
                <div className="flex items-center gap-3 px-1">
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={groupIsActive}
                      onChange={(e) => setGroupIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                  </div>
                  <label
                    htmlFor="is_active"
                    className="text-sm font-bold text-foreground/80 cursor-pointer select-none"
                  >
                    Grup Aktif
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-6 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-11 rounded-xl border border-border px-5 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingGroup || !groupName.trim()}
                  className="h-11 inline-flex items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {savingGroup ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
