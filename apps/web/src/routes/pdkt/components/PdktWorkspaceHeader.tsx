import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { PdktMailboxListItem } from "@trainers/types";
import { formatSimulationSubjectLabel } from "../../../lib/simulation-subject-display";
import { PdktStageNav, type PdktStage } from "./PdktStageNav";

type ParticipantSource = Pick<
  PdktMailboxListItem,
  "simulationSubject" | "created_by_user"
>;

/** Teks "Peserta" dan "Pelaksana" dari snapshot email (bukan data peserta terkini). */
function describePdktParticipant(item: ParticipantSource) {
  const subject = item.simulationSubject;
  const participant =
    subject?.type === "participant"
      ? [formatSimulationSubjectLabel(subject), subject.batchName, subject.team]
          .filter(Boolean)
          .join(" · ")
      : formatSimulationSubjectLabel(subject, {
          unknownLabel: "Tidak tercatat",
        });

  const creator = item.created_by_user;
  const executor = !creator
    ? "Tidak tercatat"
    : creator.is_current_user
      ? "Anda"
      : `${creator.full_name}${creator.role ? ` (${creator.role})` : ""}`;

  return { participant, executor };
}

function ParticipantInfo({ item }: { item: ParticipantSource }) {
  const { participant, executor } = describePdktParticipant(item);
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-xs text-muted-foreground">
      <span>
        Peserta:{" "}
        <strong className="font-semibold text-foreground">{participant}</strong>
      </span>
      <span>Pelaksana: {executor}</span>
    </p>
  );
}

const iconButton =
  "flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

interface InboxProps {
  mode: "inbox";
  /** Kembali ke landing PDKT; tanpa ini tombol menjadi tautan `/pdkt`. */
  onBack?: () => void;
  /**
   * Di HP panel email punya tombol kembali ke daftar sendiri; tombol ke landing
   * disembunyikan supaya tidak ada dua panah bertumpuk.
   */
  hideBackOnMobile?: boolean;
  item?: ParticipantSource | null;
}

interface FocusProps {
  mode: "focus";
  stage: PdktStage;
  onInbox: () => void;
  onSelectStage?: Partial<Record<"pahami" | "tanggapi", () => void>>;
  item: ParticipantSource;
}

/** Header ruang kerja: versi kotak masuk (Pahami) atau versi fokus (Tanggapi/Telaah). */
export function PdktWorkspaceHeader(props: InboxProps | FocusProps) {
  let content: ReactNode;

  if (props.mode === "inbox") {
    const label = "Kembali ke halaman awal PDKT";
    const backClass = props.hideBackOnMobile
      ? `${iconButton} max-md:hidden`
      : iconButton;
    content = (
      <>
        {props.onBack ? (
          <button
            type="button"
            onClick={props.onBack}
            aria-label={label}
            className={backClass}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
        ) : (
          <Link to="/pdkt" aria-label={label} className={backClass}>
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
        )}
        <h1 className="font-display text-lg font-semibold tracking-tight text-foreground">
          Simulasi PDKT
        </h1>
        {props.item && (
          <div className="ml-auto max-md:hidden">
            <ParticipantInfo item={props.item} />
          </div>
        )}
      </>
    );
  } else {
    content = (
      <>
        <button
          type="button"
          onClick={props.onInbox}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Kotak masuk
        </button>
        <PdktStageNav current={props.stage} onSelect={props.onSelectStage} />
        <div className="ml-auto max-lg:hidden">
          <ParticipantInfo item={props.item} />
        </div>
      </>
    );
  }

  return (
    <header className="z-10 flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-1.5">
      {content}
    </header>
  );
}
