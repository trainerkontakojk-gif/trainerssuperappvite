import type { ReactNode } from "react";
import type { MonitoringReviewByModule } from "@trainers/types";
import { getSimulationSubjectMeta } from "../utils/formatting";
import { KetikAssessment, KetikTranscript } from "./session/KetikSession";
import { PdktAssessment, PdktEmails } from "./session/PdktSession";
import { KeyValueList, Panel } from "./session/parts";
import {
  ketikSessionRows,
  pdktSessionRows,
  telefunSessionRows,
  type SessionRow,
} from "./session/rows";
import {
  TelefunAssessment,
  TelefunRecordingAndTranscript,
} from "./session/TelefunSession";

export type SessionReviewData =
  MonitoringReviewByModule[keyof MonitoringReviewByModule];

function partsOf(review: SessionReviewData): {
  left: ReactNode;
  rows: SessionRow[];
  assessment: ReactNode;
} {
  if (review.module === "ketik")
    return {
      left: <KetikTranscript review={review} />,
      rows: ketikSessionRows(review),
      assessment: <KetikAssessment review={review} />,
    };
  if (review.module === "pdkt")
    return {
      left: <PdktEmails review={review} />,
      rows: pdktSessionRows(review),
      assessment: <PdktAssessment review={review} />,
    };
  return {
    left: <TelefunRecordingAndTranscript review={review} />,
    rows: telefunSessionRows(review),
    assessment: <TelefunAssessment review={review} />,
  };
}

/**
 * Isi detail satu sesi: transkrip/email/rekaman di kiri, data sesi dan
 * penilaian di kanan. Dipakai halaman sesi Monitoring dan jendela SIDAK;
 * menjadi satu kolom bila wadahnya sempit.
 */
export function SessionReview({ review }: { review: SessionReviewData }) {
  const parts = partsOf(review);
  const subject = getSimulationSubjectMeta(review.simulationSubject);
  const participant = [subject.label, subject.batch, subject.team]
    .filter(Boolean)
    .join(" · ");
  const actor = review.user_email
    ? `${review.user_email}${review.user_role ? ` (${review.user_role})` : ""}`
    : null;

  return (
    <div className="@container">
      <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">{parts.left}</div>
        <div className="grid min-w-0 gap-4">
          <Panel title="Sesi">
            <KeyValueList
              rows={[
                ["Peserta", participant || null],
                ["Akun pelaksana", actor],
                ...parts.rows,
              ]}
            />
          </Panel>
          {parts.assessment}
        </div>
      </div>
    </div>
  );
}
