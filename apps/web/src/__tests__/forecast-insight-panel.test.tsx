import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { parseForecastInsightText } from "../components/sidak/forecast-insight-parser";
import ForecastInsightPanel from "../components/sidak/ForecastInsightPanel";

const sampleInsight = `Berikut adalah analisis snapshot forecast SIDAK berdasarkan data statistik yang tersedia:

### **Ringkasan Eksekutif**
Total temuan diproyeksikan turun 53.1% (-42.5 poin), menandakan perbaikan performa.

### **Analisis Parameter**
**Parameter Berisiko:**
- Etika Bertelepon (-7.3): peningkatan temuan pada parameter ini.
- Keakuratan Solusi (-5.1): perlu perhatian khusus.

**Parameter yang Meningkat:**
- Kemampuan Pencatatan (+7.3): penurunan temuan signifikan.

### **Tindakan yang Dapat Dilakukan**
1. **Coaching Etika:** Fokuskan sesi coaching pada etika bertelepon.
2. **Review Script:** Audit ulang skrip layanan untuk akurasi solusi.
3. **Monitoring Mingguan:** Pantau parameter berisiko setiap minggu.

### **Disclaimer**
*Data ini bersifat estimasi statistik dan bukan prediksi pasti.*`;

const mockForecastResult = {
  series: {
    total: {
      scope: { type: "total" as const, label: "Total Temuan" },
      historical: [],
      forecast: [{ label: "Mar 26", date: "2026-03-01", value: 10 }],
      summary: {
        direction: "down" as const,
        projectedChange: -42.5,
        projectedChangePercent: -53.1,
        confidence: "medium" as const,
        method: "linear-regression" as const,
        sourcePointCount: 6,
      },
      status: "ready" as const,
    },
    parameters: {},
  },
  insight: {
    text: sampleInsight,
    status: "generated" as const,
  },
  cache: {
    status: "hit" as const,
    filterKey: "abc",
    dataFingerprint: "def",
    generatedAt: "2026-06-14T00:00:00.000Z",
  },
  generatedAt: "2026-06-14T00:00:00.000Z",
};

describe("parseForecastInsightText", () => {
  it("parses markdown sections without leaving raw heading markers", () => {
    const parsed = parseForecastInsightText(sampleInsight);

    expect(parsed.intro).toContain("analisis snapshot forecast");
    expect(parsed.sections).toHaveLength(4);
    expect(parsed.sections[0].title).toBe("Ringkasan Eksekutif");
    expect(parsed.sections[1].subsections).toHaveLength(2);
    expect(parsed.sections[1].subsections[0].items[0].tone).toBe("risk");
    expect(parsed.sections[2].actions).toHaveLength(3);
    expect(parsed.sections[3].kind).toBe("disclaimer");
  });

  it("handles fallback paragraphs for unstructured parameter/analysis sections", () => {
    const rawText = `Berikut adalah analisis snapshot forecast SIDAK berdasarkan data yang tersedia:

### **Analisis Tren Total**
Secara keseluruhan, Total Temuan menunjukkan tren kenaikan (up) yang signifikan sebesar 67.7 poin.

### **Disclaimer Estimasi**
Data ini bersifat prediktif.`;

    const parsed = parseForecastInsightText(rawText);
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0].title).toBe("Analisis Tren Total");
    expect(parsed.sections[0].kind).toBe("parameters");
    expect(parsed.sections[0].paragraphs).toHaveLength(1);
    expect(parsed.sections[0].paragraphs[0]).toContain("Secara keseluruhan");
    expect(parsed.sections[0].subsections).toHaveLength(0);
  });

  it("parses action sections formatted with bullet points correctly", () => {
    const rawText = `Berikut adalah analisis:

### **Tindakan yang Dapat Dilakukan**
*   **Fokus pada Akurasi Input:** Pengecekan ulang SOP penginputan data.
*   **Evaluasi Kualitas Analisis:** Melakukan coaching berkala.`;

    const parsed = parseForecastInsightText(rawText);
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].title).toBe("Tindakan yang Dapat Dilakukan");
    expect(parsed.sections[0].kind).toBe("actions");
    expect(parsed.sections[0].actions).toHaveLength(2);
    expect(parsed.sections[0].actions[0].title).toBe("Fokus pada Akurasi Input");
    expect(parsed.sections[0].actions[0].body).toBe("Pengecekan ulang SOP penginputan data.");
  });
});

describe("ForecastInsightPanel", () => {
  it("renders structured insight sections instead of raw markdown", () => {
    render(
      <ForecastInsightPanel
        forecastResult={mockForecastResult}
        summary={mockForecastResult.series.total.summary}
        horizonMonths={1}
      />,
    );

    expect(screen.getByTestId("forecast-insight-panel")).toBeInTheDocument();
    expect(screen.getByText(/Insight Prediksi AI/i)).toBeInTheDocument();
    expect(screen.getByText(/Ringkasan Eksekutif/i)).toBeInTheDocument();
    expect(screen.getByText(/Coaching Etika/i)).toBeInTheDocument();
    expect(screen.getByText(/Menurun/i)).toBeInTheDocument();
    expect(screen.queryByText(/### \*\*Ringkasan Eksekutif\*\*/)).not.toBeInTheDocument();
  });
});
