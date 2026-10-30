import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import type {
  PdktEvaluationResult,
  PdktMailboxDetailItem,
} from "@trainers/types";
import { Button } from "../../../components/ui/button";
import { notify } from "../../../lib/toast";

/**
 * Unduh PDF hasil telaah satu sesi. `result` null berarti telaah belum
 * selesai: tombol nonaktif, PDF tidak pernah dibuat dari telaah setengah jadi.
 */
export function PdktReviewPdfButton({
  item,
  result,
}: {
  item: PdktMailboxDetailItem;
  result: PdktEvaluationResult | null;
}) {
  const [downloading, setDownloading] = useState(false);
  // Telaah ulang yang dimulai saat PDF dibuat membatalkan unduhan hasil lama.
  const latest = useRef(result);
  useEffect(() => {
    latest.current = result;
  }, [result]);

  const download = async () => {
    if (downloading || !result) return;
    setDownloading(true);
    try {
      const [{ generatePdktReviewPdf }, { downloadPdf }] = await Promise.all([
        import("../utils/pdktReviewPdf"),
        import("../../../utils/sessionReviewPdf"),
      ]);
      const bytes = await generatePdktReviewPdf({ item, result });
      if (latest.current !== result) return;
      downloadPdf(bytes, `pdkt_telaah_${item.history_id ?? item.id}.pdf`);
    } catch {
      notify.error("PDF belum bisa dibuat. Coba lagi.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      disabled={downloading || !result}
      onClick={() => void download()}
      className="min-h-[44px] min-w-[44px] gap-2 px-3 text-[13px]"
    >
      <Download data-icon="inline-start" />
      <span>
        <span className="max-sm:sr-only">Unduh </span>PDF
      </span>
    </Button>
  );
}
