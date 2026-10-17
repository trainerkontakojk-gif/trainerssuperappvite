import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
} from "lucide-react";
import {
  type ReviewStatus,
  type UnifiedHistoryEntry,
  getSimulationSubjectMeta,
} from "../utils/formatting";
import { Badge } from "../../../components/ui/badge";

/* Cell renderers and pager helpers for the monitoring history table. Each is
 * called as a plain function from HistoryTab, so the rendered markup is
 * unchanged. */

/** Short Indonesian date for the date-filter button. */
export function formatDateString(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("id", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Page buttons to show: all pages up to five, otherwise first, last and the current window with ellipses. */
export function getPageNumbers(current: number, total: number) {
  const pages: Array<number | string> = [];
  if (total <= 5) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    if (current <= 3) {
      pages.push(1, 2, 3, "...", total);
    } else if (current >= total - 2) {
      pages.push(1, "...", total - 2, total - 1, total);
    } else {
      pages.push(1, "...", current, "...", total);
    }
  }
  return pages;
}

/** Colored module badge (KETIK, PDKT, Telefun). */
export function renderModuleBadge(mod: string) {
  switch (mod) {
    case "ketik":
      return (
        <Badge
          variant="outline"
          className="h-7 border-transparent px-2.5 text-xs font-bold tracking-wider"
          style={{
            backgroundColor: "var(--module-ketik-bg)",
            color: "var(--module-ketik)",
            borderColor: "var(--module-ketik-bg)",
          }}
        >
          <MessageSquare aria-hidden="true" />
          <span className="uppercase">ketik</span>
        </Badge>
      );
    case "pdkt":
      return (
        <Badge
          variant="outline"
          className="h-7 border-transparent px-2.5 text-xs font-bold tracking-wider"
          style={{
            backgroundColor: "var(--module-pdkt-bg)",
            color: "var(--module-pdkt)",
            borderColor: "var(--module-pdkt-bg)",
          }}
        >
          <Mail aria-hidden="true" />
          <span className="uppercase">pdkt</span>
        </Badge>
      );
    case "telefun":
      return (
        <Badge
          variant="outline"
          className="h-7 border-transparent px-2.5 text-xs font-bold tracking-wider"
          style={{
            backgroundColor: "var(--module-telefun-bg)",
            color: "var(--module-telefun)",
            borderColor: "var(--module-telefun-bg)",
          }}
        >
          <Phone aria-hidden="true" />
          <span className="uppercase">telefun</span>
        </Badge>
      );
    default:
      return null;
  }
}

/** Review status pill. */
export function renderStatusBadge(status: ReviewStatus) {
  switch (status) {
    case "completed":
      return (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold w-fit bg-muted text-muted-foreground border border-border">
          <CheckCircle2
            size={12}
            aria-hidden="true"
            style={{ color: "var(--chart-green)" }}
          />
          <span style={{ color: "var(--chart-green)" }}>Selesai Sukses</span>
        </div>
      );
    case "processing":
    case "pending":
      return (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold w-fit bg-muted text-muted-foreground border border-border animate-pulse motion-reduce:animate-none">
          <Loader2
            size={12}
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
            style={{ color: "var(--chart-amber)" }}
          />
          <span style={{ color: "var(--chart-amber)" }}>Diproses</span>
        </div>
      );
    case "failed":
      return (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold w-fit bg-muted text-muted-foreground border border-border">
          <AlertCircle
            size={12}
            aria-hidden="true"
            style={{ color: "var(--chart-red)" }}
          />
          <span style={{ color: "var(--chart-red)" }}>Gagal</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold w-fit bg-muted text-muted-foreground border border-border">
          <AlertCircle
            size={12}
            aria-hidden="true"
            className="text-muted-foreground"
          />
          <span>Belum Dinilai</span>
        </div>
      );
  }
}

/** Consumer, target participant and executing account for one session. */
export function renderConsumerContext(entry: UnifiedHistoryEntry) {
  const name = entry.consumer_name || "Tidak tersedia";
  const subject = getSimulationSubjectMeta(entry.simulationSubject);
  const context =
    entry.module === "ketik"
      ? [entry.consumer_phone, entry.consumer_city]
      : entry.module === "pdkt"
        ? [entry.consumer_type, entry.recipient || entry.contact]
        : [entry.consumer_phone, entry.consumer_city, entry.consumer_gender];
  const usefulContext = context.filter(Boolean).join(" · ");

  return (
    <div className="min-w-[180px]" aria-label="Pelaksana dan target simulasi">
      <div className="font-semibold text-foreground">{name}</div>
      <div className="mt-0.5 break-words text-xs font-medium text-muted-foreground">
        {usefulContext || "Tidak tersedia"}
      </div>
      <div className="mt-1 break-words text-xs font-semibold text-foreground">
        Target: {subject.label}
      </div>
      {(subject.batch || subject.team) && (
        <div className="mt-0.5 break-words text-xs text-muted-foreground">
          {[
            subject.batch && `Batch: ${subject.batch}`,
            subject.team && `Tim: ${subject.team}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
      <div className="mt-0.5 break-words text-xs font-medium text-muted-foreground/90">
        Pelaksana: {entry.user_email || "-"}
        {entry.user_role ? ` · ${entry.user_role}` : ""}
      </div>
    </div>
  );
}

/** Score badge plus module-specific sub-metrics, or the pending/failed message. */
export function renderScoresAndMetrics(entry: UnifiedHistoryEntry) {
  if (entry.review_status !== "completed") {
    const message =
      entry.review_status === "failed"
        ? "Penilaian gagal"
        : entry.review_status === "not_started"
          ? "Belum dinilai"
          : "Menunggu Penilaian AI...";
    return (
      <div className="text-xs text-muted-foreground italic font-medium">
        {message}
      </div>
    );
  }

  if (entry.module === "ketik") {
    const finalVal = entry.score ?? 0;
    const s = entry.scores || {};
    const submetrics = [
      { label: "Empati", val: s.empathy ?? 0 },
      { label: "Probing", val: s.probing ?? 0 },
      ...(s.resolution !== undefined
        ? [{ label: "Resolusi", val: s.resolution }]
        : []),
      { label: "Tulis", val: s.typo ?? 0 },
      { label: "Comply", val: s.compliance ?? 0 },
    ];

    return (
      <div className="flex items-center gap-6">
        {/* Main Score Badge */}
        <div
          className="flex items-baseline justify-center px-2 py-1 rounded-lg border text-sm font-semibold h-9 min-w-[70px] bg-card border-border/50"
          style={{
            color:
              finalVal >= 80
                ? "var(--chart-green)"
                : finalVal >= 60
                  ? "var(--chart-amber)"
                  : "var(--chart-red)",
          }}
        >
          <span>{finalVal}</span>
          <span className="text-xs text-muted-foreground ml-0.5">/100</span>
        </div>

        {/* Submetrics Grid */}
        <div
          className={`grid gap-x-4 min-w-[280px] ${s.resolution !== undefined ? "grid-cols-5" : "grid-cols-4"}`}
        >
          {submetrics.map(({ label, val }) => (
            <div key={label} className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
              <span className="text-xs font-semibold text-foreground mt-0.5">
                {val}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (entry.module === "pdkt") {
    const finalVal = entry.score ?? 0;
    const ev = entry.pdkt_evaluation ?? {
      score: 0,
      feedback: "",
      typos_count: 0,
      clarity_issues_count: 0,
    };
    const submetrics = [
      { label: "Skor", val: `${ev.score}%` },
      { label: "Typo", val: ev.typos_count },
      { label: "Kejelasan", val: ev.clarity_issues_count },
      { label: "Catatan", val: ev.feedback ? "Ada" : "Tidak Ada" },
    ];

    return (
      <div className="flex items-center gap-6">
        {/* Main Score Badge */}
        <div
          className="flex items-baseline justify-center px-2 py-1 rounded-lg border text-sm font-semibold h-9 min-w-[70px] bg-card border-border/50"
          style={{
            color:
              finalVal >= 80
                ? "var(--chart-green)"
                : finalVal >= 60
                  ? "var(--chart-amber)"
                  : "var(--chart-red)",
          }}
        >
          <span>{finalVal}</span>
          <span className="text-xs text-muted-foreground ml-0.5">/100</span>
        </div>

        {/* Submetrics Grid */}
        <div className="grid grid-cols-4 gap-x-4 min-w-[280px]">
          {submetrics.map(({ label, val }) => (
            <div key={label} className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
              <span className="text-xs font-semibold text-foreground mt-0.5">
                {val}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (entry.module === "telefun") {
    const finalVal = entry.score;
    const assessment = entry.telefun_assessment;
    const submetrics = assessment
      ? [
          { label: "WPM", val: assessment.speaking_rate_wpm },
          { label: "Intonasi", val: assessment.intonation_score },
          { label: "Artikulasi", val: assessment.articulation_score },
          { label: "Filler", val: assessment.filler_words_count },
          { label: "Tone", val: assessment.emotional_tone },
        ]
      : [];

    return (
      <div className="flex items-center gap-6">
        <div
          className="flex items-baseline justify-center px-2 py-1 rounded-lg border text-sm font-semibold h-9 min-w-[70px] bg-card border-border/50"
          style={{
            color:
              finalVal === null
                ? "var(--fg3)"
                : finalVal >= 8
                  ? "var(--chart-green)"
                  : finalVal >= 6
                    ? "var(--chart-amber)"
                    : "var(--chart-red)",
          }}
        >
          <span>{finalVal ?? "-"}</span>
          <span className="text-xs text-muted-foreground ml-0.5">/10</span>
        </div>
        {assessment ? (
          <div className="grid grid-cols-5 gap-x-4 min-w-[360px]">
            {submetrics.map(({ label, val }) => (
              <div key={label} className="flex flex-col">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {label}
                </span>
                <span className="text-xs font-semibold text-foreground mt-0.5">
                  {val}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs italic text-muted-foreground">
            Penilaian suara tidak tersedia
          </span>
        )}
      </div>
    );
  }

  return null;
}
