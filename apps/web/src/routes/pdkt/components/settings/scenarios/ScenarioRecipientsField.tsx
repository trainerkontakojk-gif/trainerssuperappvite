import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../../../components/ui/button";
import { cn } from "cn";
import { PdktScenario } from "@trainers/types";
import {
  findInvalidPdktRecipientEmails,
  normalizePdktRecipientEmail,
} from "../pdktDraftNormalizers";
import { SettingsInput } from "@/components/settings/SettingsPrimitives";
import {
  REPLY_DIRECTIONS,
  getReplyDirection,
  toScenarioDirection,
} from "./replyDirections";

const SCENARIO_FALLBACK_RECIPIENT = "konsumen@ojk.go.id";

interface ScenarioRecipientsFieldProps {
  draft: Partial<PdktScenario>;
  onDraftChange: (updates: Partial<PdktScenario>) => void;
}

export function ScenarioRecipientsField({
  draft,
  onDraftChange,
}: ScenarioRecipientsFieldProps) {
  const replyDirection = getReplyDirection(draft);
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
        <h4
          id="pdkt-reply-direction-title"
          className="text-sm font-medium text-foreground"
        >
          Arah balasan
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-foreground/80">
          Kepada siapa konsumen sebenarnya meminta jawaban? Inilah yang dinilai
          QA pada aspek Arah Penerima. Peserta tidak melihat pilihan ini.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="pdkt-reply-direction-title"
        className="flex flex-col gap-2.5"
      >
        {REPLY_DIRECTIONS.map((direction) => {
          const isSelected = replyDirection === direction.id;
          return (
            <label
              key={direction.id}
              className={cn(
                "flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                isSelected
                  ? "border-foreground bg-muted/40"
                  : "border-border bg-card hover:bg-muted/40",
              )}
            >
              <input
                type="radio"
                name="pdkt-reply-direction"
                value={direction.id}
                checked={isSelected}
                onChange={() =>
                  onDraftChange(toScenarioDirection(direction.id))
                }
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-2.5">
                <span className="flex flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {direction.title}
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-px text-xs font-semibold",
                        direction.id === "ojk_request_in_body"
                          ? "bg-module-pdkt/10 text-module-pdkt"
                          : "bg-muted text-foreground/80",
                      )}
                    >
                      {direction.tag}
                    </span>
                  </span>
                  <span className="text-xs leading-[18px] text-foreground/80">
                    {direction.description}
                  </span>
                </span>
                <span
                  className={cn(
                    "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 text-xs leading-[17px]",
                    isSelected ? "bg-background" : "bg-muted/40",
                  )}
                >
                  <span className="text-muted-foreground">Kepada</span>
                  <span className="font-medium text-foreground">
                    {direction.to}
                  </span>
                  <span className="text-muted-foreground">Tembusan</span>
                  <span className="font-medium text-foreground">
                    {direction.cc}
                  </span>
                  <span className="text-muted-foreground">Jawaban benar</span>
                  <span className="font-medium text-foreground">
                    {direction.expected}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>

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
