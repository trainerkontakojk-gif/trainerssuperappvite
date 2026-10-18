import { useState } from "react";
import {
  parseTelefunTranscript,
  type TelefunMonitoringReview,
} from "@trainers/types";
import {
  getCommunicationProfileFromAssessment,
  validateAssessment,
} from "../../../../lib/voiceAssessmentUtils";
import { formatOffset } from "../../utils/formatting";
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

const METRIC_LABELS: Record<string, string> = {
  speakingRate: "Kecepatan bicara",
  intonation: "Intonasi",
  articulation: "Artikulasi",
  fillers: "Kata pengisi",
  tone: "Nada emosi",
};

function RecordingPanel({ review }: { review: TelefunMonitoringReview }) {
  const [failed, setFailed] = useState(false);
  const url = review.recording_url;
  const stored = Boolean(review.recording_path || review.agent_recording_path);

  return (
    <Panel title="Rekaman" aside={url ? "tautan berlaku 1 jam" : undefined}>
      {url ? (
        <div className="flex flex-col gap-2">
          <audio
            controls
            preload="none"
            src={url}
            className="h-10 w-full"
            onError={() => setFailed(true)}
          >
            Browser tidak mendukung pemutar audio.
          </audio>
          {failed ? (
            <EmptyNote>
              Rekaman tidak dapat diputar. File rekaman sudah dihapus atau
              tidak tersedia.
            </EmptyNote>
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start py-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              Buka di tab baru
            </a>
          )}
        </div>
      ) : stored ? (
        <EmptyNote>
          Rekaman hanya dapat diputar oleh admin dan trainer.
        </EmptyNote>
      ) : (
        <EmptyNote>Tidak ada rekaman untuk sesi ini.</EmptyNote>
      )}
    </Panel>
  );
}

export function TelefunRecordingAndTranscript({
  review,
}: {
  review: TelefunMonitoringReview;
}) {
  const transcript = parseTelefunTranscript(review.transcript);
  const legacyText = review.voice_assessment?.transcript?.trim();

  const left = (
    <>
      <RecordingPanel review={review} />
      <Panel
        title="Transkrip"
        aside={transcript.length ? `${transcript.length} bagian` : undefined}
      >
        {transcript.length ? (
          <TranscriptList>
            {transcript.map((entry, i) => (
              <TranscriptLine
                key={i}
                speaker={entry.speaker}
                time={formatOffset(entry.startMs)}
              >
                {entry.text}
              </TranscriptLine>
            ))}
          </TranscriptList>
        ) : legacyText ? (
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {legacyText}
          </p>
        ) : (
          <EmptyNote>Transkrip belum tersedia untuk sesi ini.</EmptyNote>
        )}
      </Panel>
    </>
  );

  return left;
}

export function TelefunAssessment({ review }: { review: TelefunMonitoringReview }) {
  const va = review.voice_assessment
    ? validateAssessment(review.voice_assessment)
    : null;
  const profile = getCommunicationProfileFromAssessment(va);
  const hold = va?.holdManagement;

  const rows: ScoreRow[] = va
    ? [
        {
          label: "Kecepatan bicara",
          value: va.speakingRate.score,
          note: va.speakingRate.wordsPerMinute
            ? `${Math.round(va.speakingRate.wordsPerMinute)} kata/menit`
            : null,
        },
        { label: "Intonasi", value: va.intonation.score },
        { label: "Artikulasi", value: va.articulation.score },
        {
          label: "Kata pengisi",
          value: va.fillerWords.score,
          note: `${va.fillerWords.count} kali${
            va.fillerWords.examples?.length
              ? `, mis. “${va.fillerWords.examples.slice(0, 3).join("”, “")}”`
              : ""
          }`,
        },
        {
          label: "Nada emosi",
          value: va.emotionalTone.score,
          note: va.emotionalTone.dominant || null,
        },
        ...(hold
          ? [
              {
                label: "Penanganan hold",
                value: hold.status === "not_used" ? null : hold.score,
                note:
                  hold.status === "not_used"
                    ? "tidak ada hold"
                    : `${hold.holdCount} kali · ${hold.verdict}`,
                detail: hold.status === "not_used" ? null : hold.feedback,
              },
            ]
          : []),
      ]
    : [];
  const drills = (profile?.metrics ?? []).filter(
    (metric) => metric.drill || metric.improvementTip,
  );
  const recommendations = [...(review.coaching_recommendations ?? [])].sort(
    (a, b) => a.priority - b.priority,
  );

  return (
    <Panel
      title="Penilaian suara"
      aside={<PanelScore score={review.score} scale={10} />}
    >
      {review.telefun_legacy ? (
        <TextBlock title="Riwayat Telefun lama">
          Penilaian dan coaching mungkin tidak tersedia untuk sesi ini.
        </TextBlock>
      ) : null}
      {va ? (
        <ScoreRows rows={rows} scale={10} />
      ) : (
        <TextBlock title="Penilaian suara AI belum tersedia">
          {review.review_status === "completed"
            ? "Metrik suara muncul setelah AI selesai menganalisis rekaman."
            : REVIEW_STATE_LABELS[review.review_status]}
        </TextBlock>
      )}
      {hold?.nextSteps?.length || hold?.drill ? (
        <TextBlock title="Latihan hold">
          <BulletList
            items={[
              ...(hold.nextSteps ?? []),
              ...(hold.drill ? [hold.drill] : []),
            ]}
          />
        </TextBlock>
      ) : null}
      {review.ai_summary || profile?.overallSummary ? (
        <TextBlock title="Ringkasan">
          {review.ai_summary || profile?.overallSummary}
        </TextBlock>
      ) : null}
      <StrengthsWeaknesses
        strengths={review.strengths?.length ? review.strengths : va?.strengths}
        weaknesses={review.weaknesses}
      />
      {va?.highlights?.length ? (
        <TextBlock title="Momen penting">
          <BulletList items={va.highlights} />
        </TextBlock>
      ) : null}
      {profile?.improvementPriorities?.length ? (
        <TextBlock title="Prioritas perbaikan">
          <BulletList items={profile.improvementPriorities} ordered />
        </TextBlock>
      ) : null}
      {drills.length ? (
        <TextBlock title="Latihan per metrik">
          <ul className="flex flex-col gap-1">
            {drills.map((metric) => (
              <li key={metric.key}>
                <span className="font-medium">
                  {METRIC_LABELS[metric.key] ?? metric.label}:
                </span>{" "}
                {metric.drill ?? metric.improvementTip}
              </li>
            ))}
          </ul>
        </TextBlock>
      ) : null}
      <TextBlock title="Saran coaching">
        {recommendations.length ? (
          <BulletList
            items={recommendations.map((item) => item.text)}
            ordered
          />
        ) : (
          <span className="text-muted-foreground">
            Rekomendasi coaching belum tersedia.
          </span>
        )}
      </TextBlock>
      {review.coaching_focus?.length ? (
        <TextBlock title="Fokus coaching">
          <BulletList items={review.coaching_focus} />
        </TextBlock>
      ) : null}
    </Panel>
  );
}
