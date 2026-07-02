import React from "react";
import { Plus, Trash2, Mail } from "lucide-react";
import { PdktScenario } from "@trainers/types";
import {
  findInvalidPdktRecipientEmails,
  normalizePdktRecipientEmail,
} from "../pdktDraftNormalizers";
import {
  SettingsField,
  SettingsInput,
  SettingsSelect,
} from "../SettingsPrimitives";

interface ScenarioRecipientsFieldProps {
  draft: Partial<PdktScenario>;
  onDraftChange: (updates: Partial<PdktScenario>) => void;
}

const FALLBACK_RECIPIENT = "konsumen@ojk.go.id";

export function ScenarioRecipientsField({
  draft,
  onDraftChange,
}: ScenarioRecipientsFieldProps) {
  const recipientMode = draft.recipientMode ?? "single";
  const primaryRecipientType = draft.primaryRecipientType ?? "reported_company";
  const recipientEmails = draft.recipientEmails ?? [];
  const invalidEmails = new Set(findInvalidPdktRecipientEmails(recipientEmails));

  const updateRecipientEmails = (next: string[]) => {
    onDraftChange({ recipientEmails: next });
  };

  const handleAddEmail = () => {
    updateRecipientEmails([...recipientEmails, ""]);
  };

  const handleRemoveEmail = (index: number) => {
    updateRecipientEmails(recipientEmails.filter((_, current) => current !== index));
  };

  const handleChangeEmail = (index: number, value: string) => {
    updateRecipientEmails(
      recipientEmails.map((email, current) => (current === index ? value : email)),
    );
  };

  return (
    <div
      id="scenario-recipient-targets"
      className="col-span-2 rounded-xl border border-border bg-card/20 p-4 space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground tracking-tight">
            Email Tujuan
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            Atur alamat tujuan per skenario. Alamat fallback sistem tetap selalu tersedia.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
        <div className="space-y-4">
          <SettingsField
            label="Penerima Utama"
            id="pdkt-primary-recipient-type"
            helperText="Kunci lawan bicara utama dan arah narasi saat sesi dibuat."
          >
            <SettingsSelect
              id="pdkt-primary-recipient-type"
              value={primaryRecipientType}
              onChange={(e) =>
                onDraftChange({
                  primaryRecipientType:
                    e.target.value === "ojk" ? "ojk" : "reported_company",
                })
              }
            >
              <option value="reported_company">Perusahaan terlapor</option>
              <option value="ojk">OJK 157</option>
            </SettingsSelect>
          </SettingsField>

          <SettingsField
            label="Mode Penerima"
            id="pdkt-recipient-mode"
            helperText="Fallback OJK tetap ikut; mode ini hanya mengatur alamat tambahan."
          >
            <SettingsSelect
              id="pdkt-recipient-mode"
              value={recipientMode}
              onChange={(e) =>
                onDraftChange({
                  recipientMode: e.target.value === "multiple" ? "multiple" : "single",
                })
              }
            >
              <option value="single">Pilih satu alamat</option>
              <option value="multiple">Kirim ke beberapa alamat</option>
            </SettingsSelect>
          </SettingsField>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Alamat Fallback Sistem
            </div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {FALLBACK_RECIPIENT}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-foreground">
                  Alamat Tambahan
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Tambahkan alamat custom untuk skenario ini. Email invalid akan diblok saat simpan.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddEmail}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah alamat
              </button>
            </div>

            <div className="space-y-2">
              {recipientEmails.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-foreground/[0.02] px-3 py-3 text-xs text-muted-foreground">
                  Belum ada alamat tambahan. Fallback sistem akan dipakai otomatis.
                </div>
              ) : (
                recipientEmails.map((email, index) => {
                  const trimmed = normalizePdktRecipientEmail(email);
                  const isInvalid = trimmed.length > 0 && invalidEmails.has(trimmed);
                  return (
                    <div key={index} className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <SettingsInput
                          id={`scenario-recipient-email-${index}`}
                          type="email"
                          placeholder="alamat.tujuan@domain.com"
                          value={email}
                          onChange={(e) => handleChangeEmail(index, e.target.value)}
                          aria-invalid={isInvalid}
                        />
                        {isInvalid && (
                          <p className="text-[11px] text-destructive">
                            Format email tidak valid.
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveEmail(index)}
                        className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                        aria-label={`Hapus alamat ${index + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Mode <span className="font-medium text-foreground">single</span> membatasi alamat tambahan aktif. Mode <span className="font-medium text-foreground">multiple</span> memakai semua alamat tambahan sekaligus.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
