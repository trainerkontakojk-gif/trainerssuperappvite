import { RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { CallRecord } from "../types";
import type { TelefunAnalysisState } from "../utils/reviewDisplay";

const sectionTitle =
  "font-display text-lg leading-7 font-bold tracking-tight text-foreground";
const bodyText = "max-w-[60ch] text-[15px] leading-6 text-fg2";

interface TelefunReviewStatusProps {
  record: CallRecord;
  state: Exclude<TelefunAnalysisState, "scored">;
  /** Analisis manual sedang berjalan di halaman ini. */
  analyzing: boolean;
  checking: boolean;
  onAnalyze: () => void;
  onCheckStatus: () => void;
}

/**
 * Panel kanan Telaah sebelum skor ada. Mengikuti `scoringStatus` dari antrean
 * penilaian apa adanya: tanpa persen palsu dan tanpa tombol yang tidak bisa
 * benar-benar dijalankan.
 */
export function TelefunReviewStatus({
  record,
  state,
  analyzing,
  checking,
  onAnalyze,
  onCheckStatus,
}: TelefunReviewStatusProps) {
  const canAnalyze = Boolean(record.agentRecordingPath);

  if (analyzing || state === "processing" || state === "pending") {
    return (
      <div
        role="status"
        aria-busy="true"
        className="flex flex-col items-start gap-3"
      >
        <h3 className={sectionTitle}>
          {state === "pending" && !analyzing
            ? "Menunggu analisis"
            : "Sedang dianalisis"}
        </h3>
        <p className={bodyText}>
          AI mendengarkan rekaman suara Anda. Biasanya selesai dalam 1–2 menit.
          Anda boleh meninggalkan halaman; hasilnya muncul di halaman awal
          Telefun.
        </p>
        {!analyzing && (
          <CheckButton checking={checking} onClick={onCheckStatus} />
        )}
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <h3 className={sectionTitle}>Analisis belum berhasil</h3>
        <p className={bodyText}>
          Rekaman tetap tersimpan, jadi analisis bisa dijalankan ulang tanpa
          mengulang panggilan.
          {record.scoringRetryable &&
            " Sistem juga akan mencoba lagi otomatis."}
        </p>
        {canAnalyze ? (
          <Button
            type="button"
            onClick={onAnalyze}
            className="min-h-[44px] gap-2 px-4 text-[13px] font-semibold"
          >
            <RotateCcw data-icon="inline-start" />
            Analisis ulang
          </Button>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Rekaman suara agen tidak tersedia, jadi analisis tidak bisa diulang.
          </p>
        )}
      </div>
    );
  }

  if (state === "incomplete") {
    return (
      <div className="flex flex-col items-start gap-3">
        <h3 className={sectionTitle}>Hasil analisis belum lengkap</h3>
        <p className={bodyText}>
          Analisis tercatat selesai, tetapi skornya belum tersedia. Periksa
          status beberapa saat lagi.
        </p>
        <CheckButton checking={checking} onClick={onCheckStatus} />
      </div>
    );
  }

  if (state === "no_recording") {
    return (
      <div className="flex flex-col items-start gap-3">
        <h3 className={sectionTitle}>Rekaman tidak tersimpan</h3>
        <p className={bodyText}>
          Rekaman panggilan ini tidak tersimpan, jadi suara belum bisa dinilai.
          Panggilan tetap tercatat di riwayat Anda.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <h3 className={sectionTitle}>Belum dianalisis</h3>
      {canAnalyze ? (
        <>
          <p className={bodyText}>
            Jalankan analisis AI untuk menilai kecepatan bicara, intonasi,
            artikulasi, kata pengisi, nada, dan penggunaan hold.
          </p>
          <Button
            type="button"
            onClick={onAnalyze}
            className="min-h-[44px] px-4 text-[13px] font-semibold"
          >
            Mulai analisis
          </Button>
        </>
      ) : (
        <p className={bodyText}>
          Rekaman suara agen belum tersedia untuk panggilan ini, jadi analisis
          belum bisa dijalankan.
        </p>
      )}
    </div>
  );
}

function CheckButton({
  checking,
  onClick,
}: {
  checking: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={checking}
      className="min-h-[44px] gap-2 px-3 text-[13px]"
    >
      <RefreshCw data-icon="inline-start" />
      {checking ? "Memeriksa…" : "Periksa status"}
    </Button>
  );
}
