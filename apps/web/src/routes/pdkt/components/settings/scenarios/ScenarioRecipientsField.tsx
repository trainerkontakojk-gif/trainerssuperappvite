import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../../../components/ui/button";
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
  const invalidEmails = new Set(
    findInvalidPdktRecipientEmails(recipientEmails),
  );

  const updateRecipientEmails = (next: string[]) => {
    onDraftChange({ recipientEmails: next });
  };

  const handleAddEmail = () => {
    updateRecipientEmails([...recipientEmails, ""]);
  };

  const handleRemoveEmail = (index: number) => {
    updateRecipientEmails(
      recipientEmails.filter((_, current) => current !== index),
    );
  };

  const handleChangeEmail = (index: number, value: string) => {
    updateRecipientEmails(
      recipientEmails.map((email, current) =>
        current === index ? value : email,
      ),
    );
  };

  return (
    <div id="scenario-recipient-targets" className="flex flex-col gap-4">
      <div>
        <h4 className="text-sm font-medium text-foreground">Email Tujuan</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Arahkan email simulasi ke lawan bicara utama. Alamat fallback sistem{" "}
          <span className="font-medium text-foreground">
            {FALLBACK_RECIPIENT}
          </span>{" "}
          selalu ikut terkirim.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SettingsField
          label="Penerima Utama"
          id="pdkt-primary-recipient-type"
          helperText="Menentukan lawan bicara utama dan arah narasi sesi."
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
          helperText="Hanya mengatur alamat tambahan; fallback OJK tetap dipakai."
        >
          <SettingsSelect
            id="pdkt-recipient-mode"
            value={recipientMode}
            onChange={(e) =>
              onDraftChange({
                recipientMode:
                  e.target.value === "multiple" ? "multiple" : "single",
              })
            }
          >
            <option value="single">Pilih satu alamat</option>
            <option value="multiple">Kirim ke beberapa alamat</option>
          </SettingsSelect>
        </SettingsField>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-foreground">
              Alamat Tambahan
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Alamat custom untuk skenario ini. Alamat yang tidak lolos validasi
              akan ditolak saat menyimpan.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleAddEmail}
            className="shrink-0"
          >
            <Plus data-icon="inline-start" />
            Tambah alamat
          </Button>
        </div>

        {recipientEmails.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Belum ada alamat tambahan. Fallback sistem dipakai otomatis.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {recipientEmails.map((email, index) => {
              const trimmed = normalizePdktRecipientEmail(email);
              const isInvalid =
                trimmed.length > 0 && invalidEmails.has(trimmed);
              return (
                <li key={index} className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <SettingsInput
                      id={`scenario-recipient-email-${index}`}
                      type="email"
                      placeholder="alamat.tujuan@domain.com"
                      aria-label={`Alamat email tambahan ${index + 1}`}
                      value={email}
                      onChange={(e) => handleChangeEmail(index, e.target.value)}
                      aria-invalid={isInvalid}
                      aria-describedby={
                        isInvalid
                          ? `scenario-recipient-email-${index}-error`
                          : undefined
                      }
                    />
                    {isInvalid && (
                      <p
                        id={`scenario-recipient-email-${index}-error`}
                        className="text-xs text-destructive"
                        role="alert"
                      >
                        Format email tidak valid.
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    onClick={() => handleRemoveEmail(index)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Hapus alamat ${index + 1}`}
                  >
                    <Trash2 data-icon="inline" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
