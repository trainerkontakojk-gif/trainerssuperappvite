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

const SCENARIO_FALLBACK_RECIPIENT = "konsumen@ojk.go.id";

type ReplyDirection = "cc_only" | "ojk_request_in_body" | "ojk";

const REPLY_DIRECTIONS: {
  id: ReplyDirection;
  title: string;
  description: string;
  expected: string;
}[] = [
  {
    id: "cc_only",
    title: "Hanya tembusan ke OJK",
    description:
      "Konsumen mengadu ke perusahaan dan hanya menembuskan email ke OJK.",
    expected: "Jawaban benar: ucapan terima kasih dan arahan normatif.",
  },
  {
    id: "ojk_request_in_body",
    title: "Tembusan, tapi minta bantuan OJK",
    description:
      "Email ditujukan ke perusahaan, tetapi di tengah isinya konsumen meminta bantuan OJK. Peserta harus menyadarinya sendiri.",
    expected:
      "Jawaban benar: tanggapi sebagai pengaduan ke OJK, sesuai kasus dan standar jawaban.",
  },
  {
    id: "ojk",
    title: "Langsung ke OJK",
    description: "Konsumen menulis langsung ke OJK 157.",
    expected: "Jawaban benar: sesuai kasus dan standar jawaban.",
  },
];

function getReplyDirection(draft: Partial<PdktScenario>): ReplyDirection {
  if (draft.primaryRecipientType !== "reported_company") return "ojk";
  return draft.ojkRequestInBody ? "ojk_request_in_body" : "cc_only";
}

function toScenarioDirection(
  direction: ReplyDirection,
): Pick<PdktScenario, "primaryRecipientType" | "ojkRequestInBody"> {
  if (direction === "ojk") {
    return { primaryRecipientType: "ojk", ojkRequestInBody: undefined };
  }
  return {
    primaryRecipientType: "reported_company",
    ojkRequestInBody: direction === "ojk_request_in_body" ? true : undefined,
  };
}

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
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Kepada siapa konsumen sebenarnya meminta jawaban? Inilah yang dinilai
          pada aspek Arah Penerima. Peserta tidak melihat pilihan ini.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="pdkt-reply-direction-title"
        className="flex flex-col gap-2"
      >
        {REPLY_DIRECTIONS.map((direction) => {
          const isSelected = replyDirection === direction.id;
          return (
            <label
              key={direction.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors",
                isSelected
                  ? "border-primary/50 bg-primary/5"
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
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium text-foreground">
                  {direction.title}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {direction.description}
                </span>
                <span className="text-xs leading-relaxed text-foreground">
                  {direction.expected}
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
