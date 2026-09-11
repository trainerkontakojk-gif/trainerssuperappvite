import { useEffect, useRef } from "react";
import { X, Phone, MessageCircle, Mail } from "lucide-react";
import type { SimulationSubjectSnapshot } from "@trainers/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type UnifiedHistoryEntry,
  getModuleBadgeClasses,
  getScoreColor,
  formatDuration,
  formatDate,
  getSimulationSubjectMeta,
} from "../utils/formatting";
import type { MonitoringReviewByModule } from "../../../lib/api";
import { ReviewStatusBadge } from "./ReviewStatusBadge";
import { KetikReviewPanel } from "./KetikReviewPanel";
import { PdktEvaluationPanel } from "./PdktEvaluationPanel";
import { TelefunReviewPanel } from "./TelefunReviewPanel";

interface ReviewDetailModalProps {
  entry: UnifiedHistoryEntry;
  onClose: () => void;
  durationSeconds?: number | null;
  reviewData?: MonitoringReviewByModule[UnifiedHistoryEntry["module"]] | null;
  reviewLoading?: boolean;
  reviewError?: string | null;
  onRetry?: () => void;
}

function Metadata({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-foreground">
        {value ?? "Tidak tersedia"}
      </dd>
    </div>
  );
}

interface LoadedReviewMetadata {
  simulationSubject: SimulationSubjectSnapshot | null | undefined;
  userEmail: string | null | undefined;
  userRole: string | null | undefined;
  consumerName: string | null | undefined;
  consumerPhone: string | null | undefined;
  consumerCity: string | null | undefined;
  consumerGender: string | null | undefined;
  consumerType: string | null | undefined;
  recipient: string | null | undefined;
  contact: string | null | undefined;
  simulationDuration: number | null | undefined;
}

function getLoadedReviewMetadata(
  reviewData: MonitoringReviewByModule[UnifiedHistoryEntry["module"]] | null | undefined,
): LoadedReviewMetadata {
  if (!reviewData) {
    return {
      simulationSubject: null,
      userEmail: null,
      userRole: null,
      consumerName: null,
      consumerPhone: null,
      consumerCity: null,
      consumerGender: null,
      consumerType: null,
      recipient: null,
      contact: null,
      simulationDuration: null,
    };
  }

  if (reviewData.module === "ketik") {
    return {
      simulationSubject: reviewData.simulationSubject,
      userEmail: reviewData.user_email,
      userRole: reviewData.user_role,
      consumerName: reviewData.session?.consumerName,
      consumerPhone: reviewData.session?.consumerPhone,
      consumerCity: reviewData.session?.consumerCity,
      consumerGender: null,
      consumerType: null,
      recipient: null,
      contact: null,
      simulationDuration: reviewData.session?.simulationDuration,
    };
  }

  if (reviewData.module === "pdkt") {
    return {
      simulationSubject: reviewData.simulationSubject,
      userEmail: reviewData.user_email,
      userRole: reviewData.user_role,
      consumerName: reviewData.session?.consumer_name,
      consumerPhone: null,
      consumerCity: null,
      consumerGender: null,
      consumerType: reviewData.session?.consumer_type,
      recipient: reviewData.session?.recipient,
      contact: reviewData.session?.contact,
      simulationDuration: reviewData.time_taken,
    };
  }

  return {
    simulationSubject: reviewData.simulationSubject,
    userEmail: reviewData.user_email,
    userRole: reviewData.user_role,
    consumerName: reviewData.consumer_name,
    consumerPhone: reviewData.consumer_phone,
    consumerCity: reviewData.consumer_city,
    consumerGender: reviewData.consumer_gender,
    consumerType: reviewData.persona_config?.consumerType,
    recipient: null,
    contact: null,
    simulationDuration: reviewData.duration_seconds,
  };
}

export function ReviewDetailModal({
  entry,
  onClose,
  durationSeconds,
  reviewData,
  reviewLoading,
  reviewError,
  onRetry,
}: ReviewDetailModalProps) {
  const loadedMetadata = getLoadedReviewMetadata(reviewData);
  const simulationSubject = entry.simulationSubject ?? loadedMetadata.simulationSubject;
  const userEmail = entry.user_email ?? loadedMetadata.userEmail;
  const userRole = entry.user_role ?? loadedMetadata.userRole;
  const consumerName = entry.consumer_name ?? loadedMetadata.consumerName;
  const consumerPhone = entry.consumer_phone ?? loadedMetadata.consumerPhone;
  const consumerCity = entry.consumer_city ?? loadedMetadata.consumerCity;
  const consumerGender = entry.consumer_gender ?? loadedMetadata.consumerGender;
  const consumerType = entry.consumer_type ?? loadedMetadata.consumerType;
  const recipient = entry.recipient ?? loadedMetadata.recipient;
  const contact = entry.contact ?? loadedMetadata.contact;
  const simulationDuration =
    entry.ketik_session?.simulation_duration ?? loadedMetadata.simulationDuration;
  const displayedDuration = durationSeconds === undefined
    ? entry.duration_seconds
    : durationSeconds;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const getFocusableElements = () => {
      const root = dialogRef.current;
      if (!root) return [] as HTMLElement[];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (
          !activeElement ||
          !dialogRef.current?.contains(activeElement) ||
          activeElement === firstElement
        ) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (
        !activeElement ||
        !dialogRef.current?.contains(activeElement) ||
        activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCloseRef.current();
      }}
    >
      <DialogContent
        ref={dialogRef}
        showCloseButton={false}
        aria-labelledby="review-detail-title"
        className="!w-[calc(100vw-2rem)] !max-w-4xl flex min-h-0 max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden bg-card p-0"
      >
        {/* Header */}
        <DialogHeader className="flex shrink-0 flex-row flex-wrap items-center justify-between gap-3 border-b border-border bg-foreground/[0.02] px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            {entry.module === "ketik" && (
              <MessageCircle
                size={16}
                aria-hidden="true"
                className="text-module-ketik shrink-0"
              />
            )}
            {entry.module === "pdkt" && (
              <Mail
                size={16}
                aria-hidden="true"
                className="text-module-pdkt shrink-0"
              />
            )}
            {entry.module === "telefun" && (
              <Phone
                size={16}
                aria-hidden="true"
                className="text-module-telefun shrink-0"
              />
            )}
            <div className="min-w-0">
              <DialogTitle
                id="review-detail-title"
                className="break-words text-sm font-black tracking-tight"
              >
                {entry.scenario_title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Detail sesi simulasi dan hasil penilaiannya.
              </DialogDescription>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge
                  variant="outline"
                  className={`h-auto rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-[0.08em] ${getModuleBadgeClasses(entry.module)}`}
                >
                  {entry.module}
                </Badge>
                <ReviewStatusBadge status={entry.review_status} />
                <span className="text-xs text-muted-foreground">
                  {userEmail || "-"}
                </span>
              </div>
            </div>
          </div>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Tutup detail monitoring"
            onClick={onClose}
            className="min-h-11 min-w-11 shrink-0 rounded-full hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </DialogHeader>

        {(() => {
          const subject = getSimulationSubjectMeta(simulationSubject);
          return (
            <dl
              className="mx-4 mt-4 grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:mx-6 sm:grid-cols-2 lg:grid-cols-5"
              aria-label="Atribusi simulasi"
            >
              <Metadata
                label="Target"
                value={subject.label}
              />
              <Metadata label="Batch" value={subject.batch} />
              <Metadata label="Tim" value={subject.team} />
              <Metadata
                label="Pelaksana"
                value={
                  [userEmail, userRole]
                    .filter(Boolean)
                    .join(" · ") || null
                }
              />
              <Metadata label="Konsumen" value={consumerName} />
            </dl>
          );
        })()}
        {/* Body — Each panel now renders its own content (transcript + AI assessment) */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <dl
            className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Informasi konsumen"
          >
            <Metadata label="Nama konsumen" value={consumerName} />
            {entry.module === "ketik" && (
              <>
                <Metadata label="Telepon" value={consumerPhone} />
                <Metadata label="Kota" value={consumerCity} />
                <Metadata
                  label="Durasi simulasi"
                  value={
                    simulationDuration != null
                      ? `${simulationDuration} detik`
                      : null
                  }
                />
              </>
            )}
            {entry.module === "pdkt" && (
              <>
                <Metadata label="Tipe konsumen" value={consumerType} />
                <Metadata label="Penerima" value={recipient} />
                <Metadata label="Kontak" value={contact} />
              </>
            )}
            {entry.module === "telefun" && (
              <>
                <Metadata label="Telepon" value={consumerPhone} />
                <Metadata label="Kota" value={consumerCity} />
                <Metadata
                  label="Tipe / Gender"
                  value={
                    [consumerType, consumerGender]
                      .filter(Boolean)
                      .join(" · ") || null
                  }
                />
              </>
            )}
          </dl>
          {entry.module === "ketik" && (
            <KetikReviewPanel
              entryId={entry.id}
              messages={
                Array.isArray(entry.history) ? entry.history : undefined
              }
              review={
                reviewData?.module === "ketik" ? reviewData : reviewData === null ? null : undefined
              }
              reviewLoading={reviewLoading}
              reviewError={reviewError}
              onRetry={onRetry}
            />
          )}
          {entry.module === "pdkt" && (
            <PdktEvaluationPanel
              entryId={entry.id}
              review={
                reviewData?.module === "pdkt" ? reviewData : reviewData === null ? null : undefined
              }
              reviewLoading={reviewLoading}
              reviewError={reviewError}
              onRetry={onRetry}
            />
          )}
          {entry.module === "telefun" && (
            <TelefunReviewPanel
              entryId={entry.id}
              review={
                reviewData?.module === "telefun" ? reviewData : reviewData === null ? null : undefined
              }
              reviewLoading={reviewLoading}
              reviewError={reviewError}
              onRetry={onRetry}
            />
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-none border-t border-border bg-foreground/[0.02] px-6 py-4">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div>
              <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
                Durasi
              </span>
              <span className="text-lg font-black">
                {displayedDuration === null
                  ? "Tidak tersedia"
                  : formatDuration(displayedDuration)}
              </span>
            </div>
            <div>
              <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
                Skor
              </span>
              <span
                className={`text-lg font-black ${getScoreColor(entry.score, entry.module === "telefun" ? 10 : 100)}`}
              >
                {entry.score !== null ? entry.score : "-"}
              </span>
            </div>
            <div>
              <span className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
                Waktu
              </span>
              <span className="text-xs font-bold text-muted-foreground">
                {formatDate(entry.created_at)}
              </span>
            </div>
          </div>
          <Button
            type="button"
            size="lg"
            aria-label="Tutup detail monitoring"
            onClick={() => onCloseRef.current()}
            className="min-h-11 bg-foreground px-5 text-xs font-black uppercase tracking-widest text-background hover:bg-foreground/90"
          >
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
