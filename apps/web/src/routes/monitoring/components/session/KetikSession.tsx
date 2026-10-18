import type { ReactNode } from "react";
import type { KetikMonitoringReview } from "@trainers/types";
import { formatClock } from "../../utils/formatting";
import {
  BulletList,
  EmptyNote,
  Panel,
  PanelScore,
  ScoreRows,
  StrengthsWeaknesses,
  TextBlock,
  TranscriptLine,
  TranscriptList,
  type ScoreRow,
} from "./parts";
import { REVIEW_STATE_LABELS } from "./types";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Kata yang salah ketik ditandai langsung di kalimatnya. */
function markTypos(text: string, words: string[]): ReactNode {
  const unique = [...new Set(words.filter((word) => word.trim()))];
  if (unique.length === 0) return text;
  const pattern = new RegExp(`(${unique.map(escapeRegExp).join("|")})`, "gi");
  const lower = new Set(unique.map((word) => word.toLowerCase()));
  return text.split(pattern).map((part, i) =>
    lower.has(part.toLowerCase()) ? (
      <mark
        key={i}
        className="rounded-sm bg-transparent text-destructive underline decoration-destructive decoration-wavy underline-offset-4"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function KetikTranscript({ review }: { review: KetikMonitoringReview }) {
  const session = review.session;
  const messages = session?.messages ?? [];
  const typos = review.typos ?? [];
  const typosByMessage = new Map<string, string[]>();
  for (const typo of typos) {
    typosByMessage.set(typo.messageId, [
      ...(typosByMessage.get(typo.messageId) ?? []),
      typo.originalWord,
    ]);
  }

  const transcript = (
    <Panel
      title="Transkrip chat"
      aside={`${messages.length} pesan${typos.length ? ` · ${typos.length} typo` : ""}`}
    >
      {messages.length ? (
        <TranscriptList>
          {messages.map((message, i) => {
            const agent =
              message.sender === "agent" ||
              message.role === "user" ||
              message.role === "agent";
            const text = message.text || message.content || "";
            return (
              <TranscriptLine
                key={message.id ?? i}
                speaker={agent ? "agent" : "consumer"}
                time={formatClock(message.timestamp)}
              >
                {markTypos(text, typosByMessage.get(message.id) ?? [])}
              </TranscriptLine>
            );
          })}
        </TranscriptList>
      ) : (
        <EmptyNote>Transkrip sesi ini tidak tersimpan.</EmptyNote>
      )}
    </Panel>
  );

  return transcript;
}

export function KetikAssessment({ review }: { review: KetikMonitoringReview }) {
  const data = review.review;
  if (review.review_status !== "completed" || !data) {
    return (
      <Panel title="Penilaian AI">
        <TextBlock title="Penilaian AI belum tersedia">
          {REVIEW_STATE_LABELS[review.review_status] ?? "Belum dinilai"}
        </TextBlock>
      </Panel>
    );
  }

  const scores = review.scores ?? {};
  const typoCount = review.typos?.length ?? 0;
  const rows: ScoreRow[] = [
    { label: "Empati & komunikasi", value: scores.empathy ?? null },
    { label: "Probing", value: scores.probing ?? null },
    ...(scores.resolution !== undefined
      ? [{ label: "Resolusi", value: scores.resolution }]
      : []),
    {
      label: "Tata tulis",
      value: scores.typo ?? null,
      note: typoCount ? `${typoCount} typo` : null,
    },
    { label: "Kepatuhan", value: scores.compliance ?? null },
  ];
  const guidance = [...(data.education?.dimensionGuidance ?? [])].sort(
    (a, b) => a.priorityRank - b.priorityRank,
  );

  return (
    <Panel
      title="Penilaian AI"
      aside={<PanelScore score={scores.final} scale={100} />}
    >
      <ScoreRows rows={rows} scale={100} />
      {data.aiSummary ? (
        <TextBlock title="Ringkasan">{data.aiSummary}</TextBlock>
      ) : null}
      <StrengthsWeaknesses
        strengths={data.strengths}
        weaknesses={data.weaknesses}
      />
      {data.coachingFocus?.length ? (
        <TextBlock title="Fokus coaching">
          <BulletList items={data.coachingFocus} />
        </TextBlock>
      ) : null}
      {guidance.length ? (
        <TextBlock title="Prioritas perbaikan">
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            {guidance.slice(0, 3).map((item) => (
              <li key={item.key}>
                <span className="font-medium">{item.label}.</span>{" "}
                {item.howToFix}
              </li>
            ))}
          </ol>
        </TextBlock>
      ) : null}
      {guidance.length ? (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2.5 font-medium text-muted-foreground hover:text-foreground">
            Cara memperbaiki per aspek
          </summary>
          <dl className="flex flex-col gap-3">
            {guidance.map((item) => (
              <div key={item.key}>
                <dt className="font-medium text-foreground">
                  {item.label}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {item.verdict}
                  </span>
                </dt>
                <dd className="mt-0.5 flex flex-col gap-1 text-foreground">
                  <span>{item.diagnosis}</span>
                  <span>{item.howToFix}</span>
                  {item.exampleRewrite ? (
                    <span className="text-muted-foreground">
                      Contoh: “{item.exampleRewrite}”
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      {typoCount ? (
        <TextBlock title="Typo">
          <ul className="flex flex-col gap-0.5">
            {review.typos.map((typo) => (
              <li key={typo.id}>
                {typo.originalWord} → {typo.correctedWord}
              </li>
            ))}
          </ul>
        </TextBlock>
      ) : null}
    </Panel>
  );
}
