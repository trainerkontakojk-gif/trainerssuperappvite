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
} from "@/components/settings/SettingsPrimitives";

const SCENARIO_FALLBACK_RECIPIENT = "konsumen@ojk.go.id";

interface ScenarioRecipientsFieldProps {
  draft: Partial<PdktScenario>;
  onDraftChange: (updates: Partial<PdktScenario>) => void;
}

export function ScenarioRecipientsField({
  draft,
  onDraftChange,
}: ScenarioRecipientsFieldProps) {
  const primaryRecipientType = draft.primaryRecipientType ?? "ojk";
  const recipientEmails = draft.recipientEmails ?? [];
  const invalidEmails = new Set(
    findInvalidPdktRecipientEmails(recipientEmails),
  );

  const updateRecipientEmails = (next: string[]) => {
    onDraftChange({ recipientEmails: next });
  };

  const handleAddEmail = () => {
    onDraftChange({
      recipientEmails: [...recipientEmails, ""],
      recipientMode: "multiple",
    });
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
        <h4 className="text-sm font-medium text-foreground">Penerima Email</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Tentukan lawan bicara dalam simulasi.
        </p>
      </div>

      <SettingsField
        label="Lawan Bicara Utama"
        id="pdkt-primary-recipient-type"
        helperText="Pilih tujuan utama email simulasi."
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

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-foreground">
              Email Tambahan
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Tambahkan alamat lain untuk simulasi ini.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleAddEmail}
            className="shrink-0"
          >
            <Plus data-icon="inline-start" />
            Tambah Email
          </Button>
        </div>

        {recipientEmails.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Belum ada email tambahan.
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
                      placeholder="email.tambahan@domain.com"
                      aria-label={`Email tambahan ${index + 1}`}
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
                    aria-label={`Hapus email ${index + 1}`}
                  >
                    <Trash2 data-icon="inline" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
        <span className="break-words text-sm font-medium text-foreground">
          {SCENARIO_FALLBACK_RECIPIENT}
        </span>
        <span className="text-xs text-muted-foreground">
          Disertakan otomatis.
        </span>
      </div>
    </div>
  );
}
