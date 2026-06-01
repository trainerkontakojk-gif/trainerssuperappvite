import { z } from "zod";
import { getDataReportRows } from "./report-data";
import { generateGeminiContent } from "../../lib/gemini";
import { generateOpenRouterContent } from "../../lib/openrouter";
import { resolveModelProvider } from "../../lib/ai-models";
import { parseJsonFromModelText } from "../../lib/ai-json";

export const aiReportSchema = z.object({
  modelId: z.string().optional(),
  serviceType: z.string().optional(),
  year: z.number().int().optional(),
  startMonth: z.number().int().min(1).max(12).optional(),
  endMonth: z.number().int().min(1).max(12).optional(),
  pesertaId: z.string().optional(),
  mode: z.enum(["layanan", "individu"]).default("layanan"),
});

export type AiReportParams = z.infer<typeof aiReportSchema>;

export interface AiReportResult {
  report: Record<string, any>;
  metadata: {
    totalRows: number;
    totalFindings: number;
    agentName?: string;
    serviceTypes: string;
  };
}

export async function generateAiReport(
  params: AiReportParams,
  userId: string,
  accessibleIds?: string[],
): Promise<AiReportResult> {
  const rows = await getDataReportRows({
    serviceType: params.serviceType,
    year: params.year,
    startMonth: params.startMonth,
    endMonth: params.endMonth,
    pesertaId: params.mode === "individu" ? params.pesertaId : undefined,
    agent_ids: accessibleIds ?? undefined,
  });

  if (rows.length === 0) {
    throw new Error("Tidak ada data temuan untuk filter yang dipilih.");
  }

  const totalFindings = rows.filter(
    (r) => (r.nilai ?? 3) < 3 || r.ketidaksesuaian,
  ).length;
  const agentName = rows[0]?.profiler_peserta?.nama ?? "Unknown";
  const serviceTypes = [...new Set(rows.map((r) => r.service_type))].join(
    ", ",
  );

  const modelInfo = resolveModelProvider(params.modelId);
  const findingsSample = rows.slice(0, 20).map((r) => ({
    agent: r.profiler_peserta?.nama,
    service: r.service_type,
    parameter: r.qa_indicators?.name,
    nilai: r.nilai,
    ketidaksesuaian: r.ketidaksesuaian,
    sebaiknya: r.sebaiknya,
  }));

  const prompt = `Buat laporan analisis kualitas QA dalam Bahasa Indonesia berdasarkan data berikut.

PENTING: Gunakan HANYA data yang disediakan di bawah ini. Jangan pernah mengarang, menebak, atau menambahkan angka atau temuan yang tidak ada di data. Jika data tidak mencukupi, nyatakan dengan jujur bahwa data terbatas.

Periode: ${params.startMonth ? `${params.startMonth}-${params.endMonth ?? "?"}/${params.year}` : `${params.year || "Semua"}`}
Mode: ${params.mode}
${params.mode === "individu" ? `Nama Agen: ${agentName}` : `Tipe Layanan: ${serviceTypes}`}
Total Temuan: ${totalFindings}
Total Baris Data: ${rows.length}

Sample Data (20 baris pertama):
${JSON.stringify(findingsSample, null, 2)}

Buat laporan dengan format JSON:
{
  "executiveSummary": "Ringkasan eksekutif 2-3 paragraf",
  "keyFindings": ["Temuan penting 1", "Temuan penting 2", "Temuan penting 3"],
  "scoreAnalysis": "Analisis skor dan tren",
  "recommendations": ["Rekomendasi 1", "Rekomendasi 2", "Rekomendasi 3"],
  "priorityAreas": ["Area prioritas perbaikan 1", "Area prioritas perbaikan 2"]
}`;

  const contents = [{ role: "user", parts: [{ text: prompt }] }] as any;
  const genOptions = {
    model: modelInfo.modelId,
    contents,
    temperature: 0.5,
    usageContext: {
      module: "qa-analyzer" as const,
      action: "report_generation",
    },
    userId,
  };

  const result =
    modelInfo.provider === "openrouter"
      ? await generateOpenRouterContent(genOptions)
      : await generateGeminiContent(genOptions);

  if (!result.success) {
    throw new Error(result.error || "Gagal generate laporan");
  }

  let parsedReport;
  try {
    parsedReport = parseJsonFromModelText(result.text || "");
  } catch {
    parsedReport = { executiveSummary: result.text };
  }

  return {
    report: parsedReport,
    metadata: {
      totalRows: rows.length,
      totalFindings,
      agentName: params.mode === "individu" ? agentName : undefined,
      serviceTypes,
    },
  };
}
