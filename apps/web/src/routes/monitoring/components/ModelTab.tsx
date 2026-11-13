import { useState, useEffect } from "react";
import {
  AiModelPolicyItem,
  AiModelPolicyAuditEntry,
  can,
  normalizeRole,
} from "@trainers/types";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { aiClient, unwrapResponse } from "../../../lib/api";
import { notify } from "../../../lib/toast";
import { ConfirmDialog } from "../../dashboard/components/management/ConfirmDialog";
import { ModelEditDialog } from "./ModelEditDialog";
import { useAuthStore } from "../../../store/authStore";
import { formatPricingDate, mapError } from "../utils/formatting";

interface ModelTabProps {
  onNavigateToPricing: () => void;
}

export function ModelTab({ onNavigateToPricing }: ModelTabProps) {
  const profile = useAuthStore((s) => s.profile);
  const canWrite = can(normalizeRole(profile?.role), "monitoring.models.write");

  const [policies, setPolicies] = useState<AiModelPolicyItem[]>([]);
  const [audits, setAudits] = useState<AiModelPolicyAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [editingPolicy, setEditingPolicy] = useState<AiModelPolicyItem | null>(null);
  const [revertingPolicy, setRevertingPolicy] = useState<AiModelPolicyItem | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [modelsRes, auditRes] = await Promise.all([
        unwrapResponse(await aiClient["monitoring/models"].$get()),
        unwrapResponse(await aiClient["monitoring/models/audit"].$get()),
      ]);
      setPolicies(modelsRes.items);
      setAudits(auditRes.items);
    } catch (err) {
      notify.error("Gagal memuat pengaturan model.", mapError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveModel = async (task: string, modelId: string) => {
    try {
      setBusy(true);
      await unwrapResponse(
        await aiClient["monitoring/models/:task"].$put({
          param: { task },
          json: { modelId },
        }),
      );
      notify.success("Model berhasil diperbarui.");
      setEditingPolicy(null);
      await fetchData();
    } catch (err) {
      notify.error("Gagal menyimpan model.", mapError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRevertToDefault = async () => {
    if (!revertingPolicy) return;
    try {
      setBusy(true);
      await unwrapResponse(
        await aiClient["monitoring/models/:task"].$delete({
          param: { task: revertingPolicy.task },
        }),
      );
      notify.success("Pengaturan dikembalikan ke bawaan sistem.");
      setRevertingPolicy(null);
      await fetchData();
    } catch (err) {
      notify.error("Gagal mengembalikan ke bawaan.", mapError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Policy Table */}
      <div className="rounded-lg border border-border bg-card shadow-xs">
        <div className="border-b border-border/80 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-foreground">
            Model AI per Tugas
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tentukan model AI yang digunakan oleh setiap tugas sistem atau fallback tanpa perlu deploy kode.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border/80 bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 sm:px-6">Tugas</th>
                <th className="px-4 py-3 sm:px-6">Model Aktif</th>
                <th className="px-4 py-3 sm:px-6">Status / Sumber</th>
                <th className="px-4 py-3 text-right sm:px-6">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {policies.map((p) => {
                const isCustom = p.source === "policy";
                return (
                  <tr key={p.task} className="hover:bg-muted/20">
                    <td className="px-4 py-4 sm:px-6">
                      <div className="font-medium text-foreground">{p.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.description}
                      </div>
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <div className="font-mono text-xs font-semibold text-foreground">
                        {p.modelId}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Bawaan: {p.codeDefault}
                      </div>
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      {isCustom ? (
                        <div className="space-y-1">
                          <Badge variant="secondary" className="text-xs">
                            Kustom (Database)
                          </Badge>
                          {p.updatedAt && (
                            <div className="text-[11px] text-muted-foreground">
                              Diubah {formatPricingDate(p.updatedAt)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Bawaan Sistem
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right sm:px-6">
                      <div className="flex items-center justify-end gap-2">
                        {isCustom && canWrite && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setRevertingPolicy(p)}
                            disabled={busy}
                          >
                            Bawaan
                          </Button>
                        )}
                        {canWrite && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => setEditingPolicy(p)}
                            disabled={busy}
                          >
                            Ubah
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {policies.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    Belum ada data konfigurasi model.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-lg border border-border bg-card shadow-xs">
        <div className="border-b border-border/80 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Riwayat Perubahan Model
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Catatan 20 aktivitas penggantian model AI terakhir.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/80 bg-muted/40 font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 sm:px-6">Waktu</th>
                <th className="px-4 py-2.5 sm:px-6">Tugas</th>
                <th className="px-4 py-2.5 sm:px-6">Model Lama → Baru</th>
                <th className="px-4 py-2.5 sm:px-6">Oleh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {audits.map((a) => (
                <tr key={a.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-muted-foreground sm:px-6">
                    {formatPricingDate(a.changedAt)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-foreground sm:px-6">
                    {a.task}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] sm:px-6">
                    <span className="text-muted-foreground">{a.oldModelId || "-"}</span>
                    {" → "}
                    <span className="font-semibold text-foreground">{a.newModelId}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground sm:px-6">
                    {a.changedByName || a.changedBy || "Sistem"}
                  </td>
                </tr>
              ))}
              {audits.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    Belum ada riwayat perubahan model.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Dialog */}
      <ModelEditDialog
        policy={editingPolicy}
        open={Boolean(editingPolicy)}
        onOpenChange={(open) => !open && setEditingPolicy(null)}
        onSave={handleSaveModel}
        onNavigateToPricing={onNavigateToPricing}
        busy={busy}
      />

      {/* Revert Dialog */}
      <ConfirmDialog
        open={Boolean(revertingPolicy)}
        onOpenChange={(open) => !open && setRevertingPolicy(null)}
        title="Kembalikan ke Bawaan Sistem?"
        description={`Model untuk "${revertingPolicy?.label}" akan dikembalikan ke bawaan kode (${revertingPolicy?.codeDefault}).`}
        confirmLabel="Kembalikan"
        onConfirm={handleRevertToDefault}
      />
    </div>
  );
}
