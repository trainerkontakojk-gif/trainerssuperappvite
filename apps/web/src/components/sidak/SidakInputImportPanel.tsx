import { Download, Upload, Check, X, Loader2, FileSpreadsheet } from "lucide-react";
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
}

export default function SidakInputImportPanel({
  show, onClose, importTab, onSetImportTab,
  importRows, importFile, generatingTemplate, parsing, importing,
  onDownloadTemplate, onFileUpload, onImportSave,
  disabled = false,
}: Props) {
  const validRows = importRows.filter((r) => !r.error);
  const invalidRows = importRows.filter((r) => r.error);
  const hasDuplicateError = invalidRows.some((r) => r.error.toLowerCase().includes("duplicate"));

  return (
    <div className="bg-card rounded-2xl border border-primary/20 overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-primary/5">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <p className="font-bold">Import dari Excel</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-foreground/5 text-muted-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex border-b border-border">
        {(["download", "upload"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onSetImportTab(tab)}
            className={`flex-1 py-3 text-xs font-bold transition-colors ${
              importTab === tab ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "download" ? "Download Template" : "Upload & Preview"}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-6">
        {importTab === "download" ? (
          <div className="space-y-4">
            <div className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/20">
              <p className="text-xs font-bold text-blue-500 mb-2">Cara menggunakan template</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="font-black mt-0.5">·</span>
                  Sheet <strong>Input Temuan</strong>: isi no. tiket, pilih parameter, isi nilai 0–3
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-black mt-0.5">·</span>
                  Parameter dengan nilai 3 (Sesuai) tidak perlu diisi
                </li>
              </ul>
            </div>
            <button
              onClick={onDownloadTemplate}
              disabled={generatingTemplate || disabled}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {generatingTemplate ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              {generatingTemplate ? "Menyiapkan..." : "Download Template"}
            </button>
            {disabled && (
              <p className="text-center text-xs font-medium text-amber-600 mt-2">
                Belum ada parameter untuk layanan dan periode ini. Tidak dapat mengunduh template.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <label
              className={`flex flex-col items-center justify-center gap-4 py-12 border-2 border-dashed rounded-2xl transition-all ${
                disabled
                  ? "border-border bg-foreground/5 opacity-50 cursor-not-allowed"
                  : importFile
                  ? "border-primary/40 bg-primary/5 cursor-pointer"
                  : "border-border hover:border-primary/30 cursor-pointer"
              }`}
            >
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileUpload} disabled={disabled} />
              {parsing ? (
                <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              ) : importFile ? (
                <>
                  <FileSpreadsheet className="w-10 h-10 text-primary" />
                  <div className="text-center">
                    <p className="font-semibold">{importFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">Klik untuk ganti file</p>
                  </div>
                </>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-semibold text-muted-foreground">Pilih file Excel</p>
                    <p className="text-xs text-muted-foreground mt-1">.xlsx atau .xls</p>
                  </div>
                </>
              )}
            </label>
            {disabled && (
              <p className="text-center text-xs font-medium text-amber-600 mt-2">
                Belum ada parameter untuk layanan dan periode ini. Tidak dapat melakukan import.
              </p>
            )}

            {importRows.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-green-500/10 rounded-xl p-3 text-center border border-green-500/20">
                    <p className="text-xl font-black text-green-500">{validRows.length}</p>
                    <p className="text-[10px] text-green-500 font-bold">Siap import</p>
                  </div>
                  {invalidRows.length > 0 && (
                    <div className="bg-red-500/10 rounded-xl p-3 text-center border border-red-500/20">
                      <p className="text-xl font-black text-red-500">{invalidRows.length}</p>
                      <p className="text-[10px] text-red-500 font-bold">Error</p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border overflow-hidden max-h-60 overflow-y-auto">
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
                              <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                {row.no_tiket}
                              </span>
                            )}
                            <span className="text-xs font-semibold truncate">
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
                          {row.error && <p className="text-[10px] text-red-500 mt-1">{row.error}</p>}
                        </div>
                        <span className={`text-[10px] font-bold ${row.error ? "text-red-500" : "text-green-500"}`}>
                          {row.error ? "✗" : "✓"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {hasDuplicateError && (
                  <div className="bg-red-500/10 rounded-xl p-3 text-center border border-red-500/20">
                    <p className="text-xs font-bold text-red-500">Hapus baris duplicate sebelum import</p>
                  </div>
                )}

                {validRows.length > 0 && !hasDuplicateError && invalidRows.length === 0 && (
                  <button
                    onClick={onImportSave}
                    disabled={importing}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20"
                  >
                    {importing ? (
                      <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      <Check className="w-5 h-5" />
                    )}
                    {importing ? "Menyimpan..." : `Import ${validRows.length} Temuan`}
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
