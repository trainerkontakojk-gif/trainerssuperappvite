import { useState, useRef, useEffect } from "react";
import { useApi, getApi, postApi } from "../../hooks/useApi";
import type { QAIndicator, QAPeriod } from "@trainers/types";
import {
  Plus,
  Trash2,
  Save,
  Upload,
  Download,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  generateTemplate,
  parseExcel,
  validateImportRows,
  type ParsedRow,
} from "../../lib/excel-utils";

export default function SidakInputPage() {
  const { data: periods } = useApi<QAPeriod[]>("/sidak/periods");
  const { data: agents } = useApi<any[]>("/sidak/agents");
  const { data: indicators } = useApi<QAIndicator[]>("/sidak/indicators");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [selectedService, setSelectedService] = useState("call");
  const [noTiket, setNoTiket] = useState("");
  const [items, setItems] = useState<
    Array<{
      indicator_id: string;
      nilai: number;
      ketidaksesuaian: string;
      sebaiknya: string;
    }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);

  // Draft warning
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getApi<{ success: boolean; data: any[] }>(
      `/sidak/rule-versions?service_type=${selectedService}`,
    )
      .then((res) => {
        if (!cancelled)
          setDraftCount(
            res.data?.filter((v: any) => v.status === "draft").length ?? 0,
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedService]);

  const filteredIndicators =
    indicators?.filter((i) => i.service_type === selectedService) ?? [];

  const addItem = () => {
    if (filteredIndicators.length === 0) return;
    setItems((prev) => [
      ...prev,
      {
        indicator_id: filteredIndicators[0].id,
        nilai: 3,
        ketidaksesuaian: "",
        sebaiknya: "",
      },
    ]);
  };

  const updateItem = (index: number, field: string, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedAgent || !selectedPeriod || items.length === 0) {
      setMessage({ type: "error", text: "Lengkapi semua field" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await postApi("/sidak/temuan/batch", {
        peserta_id: selectedAgent,
        period_id: selectedPeriod,
        service_type: selectedService,
        no_tiket: noTiket || null,
        items: items.map((i) => ({
          indicator_id: i.indicator_id,
          nilai: i.nilai,
          ketidaksesuaian: i.ketidaksesuaian || null,
          sebaiknya: i.sebaiknya || null,
        })),
      });
      setMessage({ type: "success", text: "Temuan berhasil disimpan!" });
      setItems([]);
      setNoTiket("");
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!indicators) return;
    const buf = await generateTemplate(indicators, selectedService);
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template-temuan-${selectedService}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !indicators) return;
    try {
      const rows = await parseExcel(file, indicators, selectedService);
      setImportRows(rows);
    } catch (err) {
      setMessage({ type: "error", text: "Gagal membaca file Excel." });
    }
  };

  const handleImport = async () => {
    if (!selectedAgent || !selectedPeriod || importRows.length === 0) return;
    setImporting(true);
    setMessage(null);

    const { valid, invalid } = validateImportRows(importRows);
    if (valid.length === 0) {
      setMessage({
        type: "error",
        text: "Tidak ada data valid untuk diimport.",
      });
      setImporting(false);
      return;
    }

    try {
      await postApi("/sidak/temuan/batch", {
        peserta_id: selectedAgent,
        period_id: selectedPeriod,
        service_type: selectedService,
        items: valid.map((r) => ({
          indicator_id: r.indicator_id!,
          nilai: r.nilai,
          ketidaksesuaian: r.ketidaksesuaian || null,
          sebaiknya: r.sebaiknya || null,
        })),
      });
      setMessage({
        type: "success",
        text: `${valid.length} temuan berhasil diimport!${invalid.length > 0 ? ` ${invalid.length} dilewati.` : ""}`,
      });
      setImportRows([]);
      setShowImport(false);
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setImporting(false);
    }
  };

  const { valid: validRows, invalid: invalidRows } =
    validateImportRows(importRows);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Input Audit</h2>
        <button
          onClick={() => setShowImport(!showImport)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
        >
          <Upload size={16} /> Import Excel
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}
        >
          {message.text}
        </div>
      )}

      {draftCount > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">
              Draft parameter belum dipublish.
            </span>{" "}
            Ada {draftCount} draft versi aturan untuk layanan ini yang belum
            dipublish. Upload akan menggunakan parameter yang sudah published.
          </div>
        </div>
      )}

      {showImport && (
        <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
          <h3 className="font-semibold">Import Excel</h3>
          <div className="flex gap-3">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-4 py-2 border border-indigo-300 text-indigo-600 rounded-lg text-sm hover:bg-indigo-50"
            >
              <Download size={16} /> Download Template
            </button>
            <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 cursor-pointer">
              <Upload size={16} /> Pilih File Excel
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {importRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle size={14} /> {validRows.length} Valid
                </span>
                <span className="flex items-center gap-1 text-sm text-red-600">
                  <XCircle size={14} /> {invalidRows.length} Invalid
                </span>
              </div>
              <div className="max-h-60 overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">No Tiket</th>
                      <th className="p-2 text-left">Indikator</th>
                      <th className="p-2 text-center">Nilai</th>
                      <th className="p-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr
                        key={i}
                        className={`border-t ${r.error ? "bg-red-50" : ""}`}
                      >
                        <td className="p-2">{r.no_tiket}</td>
                        <td className="p-2">{r.indicator_name}</td>
                        <td className="p-2 text-center">{r.nilai}</td>
                        <td className="p-2">
                          {r.error ? (
                            <span className="text-xs text-red-600">
                              {r.error}
                            </span>
                          ) : (
                            <span className="text-xs text-green-600">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                <Upload size={16} />{" "}
                {importing
                  ? "Mengimport..."
                  : `Import ${validRows.length} Temuan`}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-white rounded-xl border shadow-sm p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Agent
          </label>
          <select
            className="w-full border rounded-lg p-2"
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
          >
            <option value="">Pilih Agent</option>
            {(agents ?? []).map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.nama} - {a.batch_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Periode
          </label>
          <select
            className="w-full border rounded-lg p-2"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            <option value="">Pilih Periode</option>
            {(periods ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.month}/{p.year}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Service
          </label>
          <select
            className="w-full border rounded-lg p-2"
            value={selectedService}
            onChange={(e) => {
              setSelectedService(e.target.value);
              setImportRows([]);
            }}
          >
            {["call", "chat", "email", "cso", "pencatatan", "bko", "slik"].map(
              (s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            No Tiket
          </label>
          <input
            className="w-full border rounded-lg p-2"
            value={noTiket}
            onChange={(e) => setNoTiket(e.target.value)}
            placeholder="Opsional"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Indikator</h3>
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <Plus size={16} /> Tambah Indikator
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">
            Belum ada indikator. Klik "Tambah Indikator" untuk mulai.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => {
              const ind = filteredIndicators.find(
                (ind) => ind.id === item.indicator_id,
              );
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <select
                    className="flex-1 border rounded-lg p-2 text-sm"
                    value={item.indicator_id}
                    onChange={(e) =>
                      updateItem(i, "indicator_id", e.target.value)
                    }
                  >
                    {filteredIndicators.map((ind) => (
                      <option key={ind.id} value={ind.id}>
                        {ind.name} ({ind.category})
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-20 border rounded-lg p-2 text-sm"
                    value={item.nilai}
                    onChange={(e) =>
                      updateItem(i, "nilai", parseInt(e.target.value))
                    }
                  >
                    {[0, 1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <input
                    className="flex-1 border rounded-lg p-2 text-sm"
                    placeholder="Ketidaksesuaian"
                    value={item.ketidaksesuaian}
                    onChange={(e) =>
                      updateItem(i, "ketidaksesuaian", e.target.value)
                    }
                  />
                  <input
                    className="flex-1 border rounded-lg p-2 text-sm"
                    placeholder="Sebaiknya"
                    value={item.sebaiknya}
                    onChange={(e) => updateItem(i, "sebaiknya", e.target.value)}
                  />
                  <button
                    onClick={() => removeItem(i)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save size={18} /> {saving ? "Menyimpan..." : "Simpan Temuan"}
          </button>
        )}
      </div>
    </div>
  );
}
