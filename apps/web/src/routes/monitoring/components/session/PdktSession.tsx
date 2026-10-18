import type { PdktMonitoringReview } from "@trainers/types";
import {
  PdktActionItemsCard,
  PdktReplyAnnotationsCard,
  PdktSuggestedRewriteCard,
} from "../../../../components/PdktEducationSections";
import {
  PDKT_DIMENSION_LABELS,
  PDKT_DIMENSION_SCORE_FIELDS,
} from "../../../../lib/pdkt-dimensions";
import { ExpectedAnswerAlignmentCard } from "../../../pdkt/components/ExpectedAnswerAlignmentCard";
import { formatClock } from "../../utils/formatting";
import {
  BulletList,
  EmptyNote,
  KeyValueList,
  Panel,
  PanelScore,
  ScoreRows,
  TextBlock,
} from "./parts";
import { REVIEW_STATE_LABELS } from "./types";

/** Kode kegagalan telaah tidak pernah ditampilkan mentah ke trainer. */
function pdktEvaluationErrorCopy(value: string | null): string {
  switch (value) {
    case "ai_unavailable":
      return "AI belum bisa dihubungi saat menelaah. Coba telaah ulang beberapa saat lagi.";
    case "ai_invalid_output":
      return "Hasil telaah AI tidak lengkap. Coba telaah ulang.";
    default:
      return "Telaah gagal. Coba telaah ulang.";
  }
}

export function PdktEmails({ review }: { review: PdktMonitoringReview }) {
  const emails = review.emails ?? [];

  const mail = (
    <Panel title="Email" aside={`${emails.length} email`}>
      {emails.length ? (
        <ol className="divide-y divide-border/60">
          {emails.map((email, i) => {
            const agent =
              email.isAgent === true ||
              (email.type !== undefined && email.type !== "received");
            return (
              <li
                key={email.id ?? i}
                className="py-3 text-sm first:pt-1 last:pb-1"
              >
                <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
                  <span className="min-w-0 break-words">
                    <b className="font-semibold text-foreground">
                      {agent ? "Balasan agen" : email.from || "Konsumen"}
                    </b>
                    {email.to ? ` → ${email.to}` : null}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatClock(email.timestamp)}
                  </span>
                </div>
                {email.subject ? (
                  <p className="mt-1 font-medium text-foreground">
                    {email.subject}
                  </p>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap break-words text-foreground">
                  {email.body || email.content || ""}
                </p>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyNote>Email sesi ini tidak tersimpan.</EmptyNote>
      )}
    </Panel>
  );

  return mail;
}

function IssueList({ items, empty }: { items?: string[]; empty: string }) {
  return items?.length ? (
    <BulletList items={items} />
  ) : (
    <span className="font-normal text-muted-foreground">{empty}</span>
  );
}

export function PdktAssessment({ review }: { review: PdktMonitoringReview }) {
  const evaluation = review.evaluation;
  if (review.review_status !== "completed" || !evaluation) {
    return (
      <Panel title="Penilaian AI">
        <TextBlock title="Penilaian AI belum tersedia">
          {REVIEW_STATE_LABELS[review.review_status] ?? "Belum dinilai"}
        </TextBlock>
        {review.evaluation_error ? (
          <p className="text-sm text-destructive">
            {pdktEvaluationErrorCopy(review.evaluation_error)}
          </p>
        ) : null}
      </Panel>
    );
  }

  const breakdown = evaluation.scoreBreakdown;
  const edu = evaluation.edu;
  const rows = breakdown
    ? PDKT_DIMENSION_SCORE_FIELDS.map(([dimension, field]) => {
        const value = breakdown[field];
        const tip = edu?.dimensionTips?.[dimension];
        return {
          label: PDKT_DIMENSION_LABELS[dimension],
          value: typeof value === "number" ? value : null,
          detail: typeof value === "number" && value < 75 && tip ? tip : null,
        };
      })
    : [];
  const count = (items?: string[]) =>
    items?.length ? ` (${items.length})` : "";

  return (
    <Panel
      title="Penilaian AI"
      aside={<PanelScore score={evaluation.score} scale={100} />}
    >
      {rows.length ? <ScoreRows rows={rows} scale={100} /> : null}
      {evaluation.feedback ? (
        <TextBlock title="Umpan balik">{evaluation.feedback}</TextBlock>
      ) : null}
      <KeyValueList
        rows={[
          [
            `Typo${count(evaluation.typos)}`,
            <IssueList items={evaluation.typos} empty="Tidak ada" />,
          ],
          [
            `Kejelasan${count(evaluation.clarityIssues)}`,
            <IssueList items={evaluation.clarityIssues} empty="Sudah jelas" />,
          ],
          [
            `Isi yang kurang${count(evaluation.contentGaps)}`,
            <IssueList items={evaluation.contentGaps} empty="Tidak ada" />,
          ],
        ]}
      />
      {evaluation.expectedAnswerAlignment ? (
        <ExpectedAnswerAlignmentCard
          alignment={evaluation.expectedAnswerAlignment}
        />
      ) : null}
      <PdktReplyAnnotationsCard
        annotations={evaluation.annotations}
        replyBody={review.emails?.find((email) => email.isAgent)?.body}
        title="Catatan di balasan agent"
      />
      <PdktActionItemsCard edu={edu} />
      <PdktSuggestedRewriteCard edu={edu} />
    </Panel>
  );
}
