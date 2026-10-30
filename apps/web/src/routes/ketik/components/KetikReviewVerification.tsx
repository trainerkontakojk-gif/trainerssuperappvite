import type {
  KetikIdentityAnomaly,
  KetikIdentityAnomalyField,
  KetikVerificationReview,
  KetikVerificationStatus,
} from "@trainers/types";
import { cn } from "cn";
import { FIELD_LABELS, STATUS } from "../utils/verificationDisplay";
import { QuoteButton } from "./KetikReviewAnnotations";

/**
 * Telaah "Verifikasi data": only for sessions whose NIK, email or domicile was
 * deliberately malformed. Anomalies come from the session itself
 * (`detectKetikIdentityAnomalies`); the status comes from the review.
 */

function StatusLabel({
  status,
  className,
}: {
  status: KetikVerificationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-foreground",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", STATUS[status].dot)}
      />
      {STATUS[status].label}
    </span>
  );
}

const markClass =
  "rounded-sm border-b-2 border-chart-orange bg-chart-orange/25 px-0.5 text-foreground";

/** The value with its malformed part marked, e.g. the `gnail.com` domain. */
function MarkedValue({ anomaly }: { anomaly: KetikIdentityAnomaly }) {
  const at = anomaly.value.lastIndexOf(anomaly.highlight);
  if (at < 0) return <mark className={markClass}>{anomaly.value}</mark>;
  return (
    <span>
      {anomaly.value.slice(0, at)}
      <mark className={markClass}>{anomaly.highlight}</mark>
      {anomaly.value.slice(at + anomaly.highlight.length)}
    </span>
  );
}

type VisibleField = KetikIdentityAnomalyField | "phone";
const VISIBLE_LABELS: Record<VisibleField, string> = {
  ...FIELD_LABELS,
  phone: "Nomor telepon",
};

/** Above the transcript: what the agent saw in the Data konsumen panel. */
export function KetikVisibleConsumerData({
  values,
  anomalies,
}: {
  /** Session values; sessions from before NIK/email have none. */
  values: Record<VisibleField, string | null | undefined>;
  anomalies: readonly KetikIdentityAnomaly[];
}) {
  const fields: VisibleField[] = ["city", "phone", "nik", "email"];
  return (
    <section
      aria-labelledby="ketik-visible-data-title"
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-3"
    >
      <h3
        id="ketik-visible-data-title"
        className="text-xs font-medium text-muted-foreground"
      >
        Data konsumen yang terlihat di panel agen
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {fields.map((field) => {
          const anomaly = anomalies.find((item) => item.field === field);
          return (
            <div key={field} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">
                {VISIBLE_LABELS[field]}
              </dt>
              <dd
                className={cn(
                  "flex flex-wrap items-center gap-2 font-medium break-all text-foreground",
                  field === "nik" || field === "phone"
                    ? "font-mono text-[13.5px]"
                    : "text-sm",
                )}
              >
                {anomaly ? (
                  <>
                    <MarkedValue anomaly={anomaly} />
                    <span className="rounded-md border border-border px-1.5 py-px font-sans text-xs font-medium text-fg2">
                      {anomaly.label}
                    </span>
                  </>
                ) : (
                  values[field] || "—"
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/** Dashed line in the transcript where the agent should have asked or confirmed. */
export function KetikVerificationMarker({
  status,
}: {
  status: KetikVerificationStatus;
}) {
  return (
    <li
      role="note"
      className="flex items-center gap-3 py-1 pl-8 text-xs font-medium text-fg2"
    >
      <span
        aria-hidden="true"
        className="flex-1 border-t border-dashed border-chart-orange"
      />
      <span className="max-w-[40ch] text-center">
        {status === "not_asked"
          ? "Data seharusnya diminta dan dikonfirmasi di sini"
          : "Data tidak sesuai seharusnya dikonfirmasi di sini"}
      </span>
      <span
        aria-hidden="true"
        className="flex-1 border-t border-dashed border-chart-orange"
      />
    </li>
  );
}

/** Result panel section under the aspect scores. */
export function KetikVerificationSummary({
  verification,
  numbers,
  onShowMessage,
}: {
  verification: KetikVerificationReview;
  numbers: Map<string, number>;
  onShowMessage: (messageId: string) => void;
}) {
  return (
    <section
      aria-labelledby="ketik-verification-title"
      className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3
          id="ketik-verification-title"
          className="text-sm font-semibold text-foreground"
        >
          Verifikasi data
        </h3>
        <StatusLabel status={verification.status} />
      </div>
      <p className="max-w-[65ch] text-[13px] leading-5 text-fg2">
        Data konsumen di sesi ini sengaja tidak sesuai. Agen cukup menanyakan
        atau mengonfirmasinya sekali, walaupun konsumen tidak menjawab.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px] break-words">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Data
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Tidak sesuai karena
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Di percakapan
              </th>
            </tr>
          </thead>
          <tbody>
            {verification.fields.map((field) => (
              <tr
                key={field.field}
                className="border-t border-border align-top"
              >
                <th
                  scope="row"
                  className="py-2 pr-3 text-left font-medium text-foreground"
                >
                  {FIELD_LABELS[field.field]}
                </th>
                <td className="py-2 pr-3 text-fg2">{field.reason}</td>
                <td className="py-2">
                  <div className="flex flex-col gap-1.5">
                    <StatusLabel status={field.status} />
                    {field.agentMessageId && field.agentQuote ? (
                      <QuoteButton
                        prefix="Pesan"
                        messageId={field.agentMessageId}
                        quote={field.agentQuote}
                        numbers={numbers}
                        onShowMessage={onShowMessage}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
