import {
  Download,
  Upload,
  Check,
  X,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";
import { NILAI_BADGE_COLORS } from "../../lib/scoring";

export interface ParsedImportRow {
  rowNum: number;
  no_tiket: string;
  paramName: string;
  indicator_id: string | null;
  nilai: number | null;
  ketidaksesuaian: string;
  sebaiknya: string;
  error: string;
}

interface Props {
  show: boolean;
  onClose: () => void;
  importTab: "download" | "upload";
  onSetImportTab: (tab: "download" | "upload") => void;
  importRows: ParsedImportRow[];
  importFile: File | null;
  generatingTemplate: boolean;
  parsing: boolean;
  importing: boolean;
  onDownloadTemplate: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImportSave: () => void;
  disabled?: boolean;
  serviceType?: string;
}

export default function SidakInputImportPanel({
  show,
  onClose,
  importTab,
  onSetImportTab,
  importRows,
  importFile,
  generatingTemplate,
  parsing,
  importing,
  onDownloadTemplate,
  onFileUpload,
  onImportSave,
  disabled = false,
  serviceType,
}: Props) {
  const validRows = importRows.filter((r) => !r.error);
  const invalidRows = importRows.filter((r) => r.error);
  const hasDuplicateError = invalidRows.some((r) =>
    r.error.toLowerCase().includes("duplicate"),
  );

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
          <p className="font-semibold text-foreground">Import dari Excel</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-foreground/5 text-muted-foreground"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex border-b border-border">
        {(["download", "upload"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onSetImportTab(tab)}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
              importTab === tab
                ? "text-foreground border-b-2 border-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "download" ? "Download Template" : "Upload & Preview"}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-6">
        {importTab === "download" ? (
          <div className="space-y-4">
            <div className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/20">
              <p className="text-xs font-semibold text-blue-600 mb-2">
                Cara menggunakan template
              </p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="font-semibold mt-0.5">·</span>
                  <span>
                    Sheet <strong>Input Temuan</strong>: isi no. tiket, pilih
                    parameter/sub-parameter, isi nilai 0–3
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold mt-0.5">·</span>
                  <span>
                    Parameter dengan nilai 3 (Sesuai) tidak perlu diisi
                  </span>
                </li>
                {serviceType === "slik" && (
                  <li className="flex items-start gap-2">
                    <span className="font-semibold mt-0.5">·</span>
                    <span>
                      Khusus SLIK, nilai <strong>3</strong> setara dengan nilai
                      rekomendasi <strong>1</strong> pada matriks referensi.
                    </span>
                  </li>
                )}
              </ul>
            </div>
            <button
              onClick={onDownloadTemplate}
              disabled={generatingTemplate || disabled}
              className="w-full flex items-center justify-center gap-2 py-3 bg-foreground hover:opacity-90 disabled:opacity-50 text-background rounded-lg text-xs font-semibold uppercase tracking-wide transition-all"
            >
              {generatingTemplate ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {generatingTemplate ? "Menyiapkan..." : "Download Template"}
            </button>
            {disabled && (
              <p className="text-center text-xs font-medium text-amber-600 mt-2">
                Belum ada parameter untuk layanan dan periode ini. Tidak dapat
                mengunduh template.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <label
              className={`flex flex-col items-center justify-center gap-4 py-12 border border-dashed rounded-xl transition-all ${
                disabled
                  ? "border-border bg-foreground/5 opacity-50 cursor-not-allowed"
                  : importFile
                    ? "border-foreground/35 bg-foreground/5 cursor-pointer"
                    : "border-border hover:border-foreground/30 cursor-pointer"
              }`}
            >
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={onFileUpload}
                disabled={disabled}
              />
              {parsing ? (
                <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
              ) : importFile ? (
                <>
                  <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-semibold text-foreground text-sm">
                      {importFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Klik untuk ganti file
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-semibold text-muted-foreground text-sm">
                      Pilih file Excel
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      .xlsx atau .xls
                    </p>
                  </div>
                </>
              )}
            </label>
            {disabled && (
              <p className="text-center text-xs font-medium text-amber-600 mt-2">
                Belum ada parameter untuk layanan dan periode ini. Tidak dapat
                melakukan import.
              </p>
            )}

            {importRows.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-500/5 rounded-lg p-3 text-center border border-emerald-500/20">
                    <p className="text-xl font-bold text-emerald-600">
                      {validRows.length}
                    </p>
                    <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">
                      Siap import
                    </p>
                  </div>
                  {invalidRows.length > 0 && (
                    <div className="bg-red-500/5 rounded-lg p-3 text-center border border-red-500/20">
                      <p className="text-xl font-bold text-red-600">
                        {invalidRows.length}
                      </p>
                      <p className="text-[10px] text-red-600 font-semibold uppercase tracking-wide">
                        Error
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border overflow-hidden max-h-60 overflow-y-auto">
                  {importRows.map((row) => (
                    <div
                      key={row.rowNum}
                      className={`px-4 py-3 border-b border-border last:border-0 ${
                        row.error ? "bg-red-500/5" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-[10px] font-mono text-muted-foreground mt-0.5 w-6">
                          R{row.rowNum}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {row.no_tiket && (
                              <span className="text-[10px] font-mono font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                                {row.no_tiket}
                              </span>
                            )}
                            <span className="text-xs font-semibold text-foreground truncate">
                              {row.paramName || "—"}
                            </span>
                            {row.nilai !== null && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${NILAI_BADGE_COLORS[row.nilai]}`}
                              >
                                {row.nilai}
                              </span>
                            )}
                          </div>
                          {row.error && (
                            <p className="text-[10px] text-red-500 mt-1">
                              {row.error}
                            </p>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-bold ${row.error ? "text-red-500" : "text-green-500"}`}
                        >
                          {row.error ? "✗" : "✓"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {hasDuplicateError && (
                  <div className="bg-red-500/5 rounded-lg p-3 text-center border border-red-500/25">
                    <p className="text-xs font-semibold text-red-600">
                      Hapus baris duplicate sebelum import
                    </p>
                  </div>
                )}

                {validRows.length > 0 &&
                  !hasDuplicateError &&
                  invalidRows.length === 0 && (
                    <button
                      onClick={onImportSave}
                      disabled={importing}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-foreground hover:opacity-90 disabled:opacity-50 text-background rounded-lg text-xs font-semibold uppercase tracking-wide transition-all"
                    >
                      {importing ? (
                        <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {importing
                        ? "Menyimpan..."
                        : `Import ${validRows.length} Temuan`}
                    </button>
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
