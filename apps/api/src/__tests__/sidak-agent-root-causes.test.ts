import { describe, expect, it, beforeAll } from "vitest";
import { deriveAgentRootCauses } from "../services/sidak/agent-root-causes";
import type { QAIndicator, QAPeriod, QATemuan } from "@trainers/types";

const indicators: QAIndicator[] = [
  {
    id: "i-accuracy",
    service_type: "call",
    name: "Akurasi Jawaban",
    category: "critical",
    bobot: 10,
    has_na: false,
  },
  {
    id: "i-probing",
    service_type: "call",
    name: "Menggali Kebutuhan",
    category: "non_critical",
    bobot: 10,
    has_na: false,
  },
];

const periods: QAPeriod[] = [
  { id: "p-jun", month: 6, year: 2026, label: "06/2026" },
  { id: "p-jul", month: 7, year: 2026, label: "07/2026" },
];

const periodById = new Map(periods.map((p) => [p.id, p]));

function row(overrides: Partial<QATemuan>): QATemuan {
  return {
    id: overrides.id ?? "row-1",
    peserta_id: overrides.peserta_id ?? "agent-1",
    period_id: overrides.period_id ?? "p-jul",
    indicator_id: overrides.indicator_id ?? "i-accuracy",
    service_type: overrides.service_type ?? "call",
    no_tiket: overrides.no_tiket ?? "T-001",
    nilai: overrides.nilai ?? 0,
    ketidaksesuaian: overrides.ketidaksesuaian ?? null,
    sebaiknya: overrides.sebaiknya ?? null,
    tahun: 2026,
    is_phantom_padding: overrides.is_phantom_padding ?? false,
  };
}

describe("deriveAgentRootCauses", () => {
  it("chooses the highest-priority matching cluster when text matches multiple clusters", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      serviceType: "call",
      temuan: [
        row({
          id: "r1",
          ketidaksesuaian:
            "Salah jawaban dan nama perusahaan salah pada penjelasan.",
        }),
      ],
    });

    expect(result[0]).toMatchObject({
      clusterId: "salah_nama_perusahaan_produk",
      priority: 10,
      findingsCount: 1,
      affectedTickets: 1,
    });
  });

  it("falls back to lainnya when no keyword matches", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({ id: "r1", ketidaksesuaian: "Intonasi kurang konsisten." }),
      ],
    });

    expect(result[0].clusterId).toBe("lainnya");
    expect(result[0].matchedKeywords).toEqual([]);
  });

  it("excludes phantom padding but includes nilai 3 rows with evidence", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "phantom",
          ketidaksesuaian: "salah jawaban",
          is_phantom_padding: true,
        }),
        row({
          id: "recommendation",
          ketidaksesuaian: "salah jawaban",
          nilai: 3,
        }),
        row({ id: "good", ketidaksesuaian: "salah jawaban", nilai: 2 }),
      ],
    });

    // Both nilai=2 and nilai=3 rows are counted, phantom is excluded
    expect(result).toHaveLength(1);
    expect(result[0].findingsCount).toBe(2);
    expect(result[0].criticalFindingsCount).toBe(0);
    expect(result[0].averageNilai).toBe(2.5);
  });

  it("filters by serviceType when provided", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      serviceType: "email",
      temuan: [
        row({
          id: "r1",
          ketidaksesuaian: "salah jawaban",
          service_type: "call",
        }),
        row({
          id: "r2",
          ketidaksesuaian: "salah jawaban",
          service_type: "email",
        }),
      ],
    });

    // Only the email row should be counted
    expect(result).toHaveLength(1);
    expect(result[0].findingsCount).toBe(1);
  });

  it("counts unique affected tickets", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({ id: "r1", ketidaksesuaian: "salah jawaban", no_tiket: "T-001" }),
        row({ id: "r2", ketidaksesuaian: "salah jawaban", no_tiket: "T-001" }),
        row({ id: "r3", ketidaksesuaian: "salah jawaban", no_tiket: "T-002" }),
      ],
    });

    expect(result[0].affectedTickets).toBe(2);
    expect(result[0].findingsCount).toBe(3);
  });

  it("builds period breakdown for active-month filtering", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "jun",
          period_id: "p-jun",
          no_tiket: "T-001",
          ketidaksesuaian: "kurang menggali",
        }),
        row({
          id: "jul",
          period_id: "p-jul",
          no_tiket: "T-002",
          ketidaksesuaian: "kurang menggali",
        }),
      ],
    });

    expect(result[0].periods).toEqual([
      expect.objectContaining({
        periodId: "p-jun",
        findingsCount: 1,
        criticalFindingsCount: 1,
        affectedTickets: 1,
        month: 6,
        year: 2026,
      }),
      expect.objectContaining({
        periodId: "p-jul",
        findingsCount: 1,
        criticalFindingsCount: 1,
        affectedTickets: 1,
        month: 7,
        year: 2026,
      }),
    ]);
  });

  it("sorts by priority, findingsCount, and criticalFindingsCount", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r1",
          ketidaksesuaian: "kurang menggali",
          nilai: 1,
        }),
        row({
          id: "r2",
          ketidaksesuaian: "salah jawaban",
          nilai: 0,
        }),
        row({
          id: "r3",
          ketidaksesuaian: "salah jawaban",
          nilai: 1,
        }),
      ],
    });

    // highest priority (8) with 2 findings, 1 critical should be first
    expect(result[0].clusterId).toBe("salah_jawaban");
    expect(result[0].findingsCount).toBe(2);
    expect(result[0].criticalFindingsCount).toBe(1);

    // lower priority (5) with 1 finding should be second
    expect(result[1].clusterId).toBe("kurang_menggali");
    expect(result[1].findingsCount).toBe(1);
  });

  it("returns fallback cluster when only row is phantom padding or nilai 3 with null evidence", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "phantom",
          ketidaksesuaian: "salah jawaban",
          is_phantom_padding: true,
        }),
        row({ id: "no-evidence", ketidaksesuaian: null, nilai: 3 }),
      ],
    });

    // Phantom excluded; nilai=3 with no text → fallback lainnya
    expect(result).toHaveLength(1);
    expect(result[0].clusterId).toBe("lainnya");
    expect(result[0].findingsCount).toBe(1);
  });

  it("uses fallback audit key when no_tiket is empty", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "row-no-ticket",
          no_tiket: "",
          ketidaksesuaian: "salah jawaban",
        }),
      ],
    });

    expect(result[0].affectedTickets).toBe(1);
    expect(result[0].findingsCount).toBe(1);
  });

  it("scopes maxEvidencePerCluster correctly", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      maxEvidencePerCluster: 1,
      temuan: [
        row({ id: "r1", ketidaksesuaian: "salah jawaban" }),
        row({ id: "r2", ketidaksesuaian: "salah jawaban" }),
        row({ id: "r3", ketidaksesuaian: "salah jawaban" }),
      ],
    });

    // Still counts all findings
    expect(result[0].findingsCount).toBe(3);
    // But only 1 evidence item
    expect(result[0].evidence).toHaveLength(1);
  });

  it("builds search text from ketidaksesuaian, sebaiknya, and indicator name", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r1",
          ketidaksesuaian: null,
          sebaiknya: "Sebaiknya verifikasi data nasabah lebih teliti",
          indicator_id: "i-accuracy",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("kurang_teliti_verifikasi_data");
  });

  it("counts critical findings correctly (nilai === 0)", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({ id: "r1", ketidaksesuaian: "salah jawaban", nilai: 0 }),
        row({ id: "r2", ketidaksesuaian: "salah jawaban", nilai: 0 }),
        row({ id: "r3", ketidaksesuaian: "salah jawaban", nilai: 1 }),
      ],
    });

    expect(result[0].criticalFindingsCount).toBe(2);
    expect(result[0].findingsCount).toBe(3);
  });

  // ─── Phase 2: Registry Expansion Tests ────────────────────────────

  it("maps 'tidak sesuai dalam memilih' phrase to salah_jawaban cluster (without APPK system context)", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-memilih",
          ketidaksesuaian:
            "Agent tidak sesuai dalam memilih jenis penanganan yang tepat.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("salah_jawaban");
  });

  it("maps 'salah memilih' phrase to salah_jawaban cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-salah-memilih",
          ketidaksesuaian: "Salah memilih jenis produk yang tersedia.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("salah_jawaban");
  });

  it("maps 'tidak sesuai mencatat' phrase to kurang_teliti_verifikasi_data cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-mencatat",
          ketidaksesuaian: "Agent tidak sesuai mencatat kolom PUJK.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("kurang_teliti_verifikasi_data");
  });

  it("maps 'tidak sesuai dalam memberikan' phrase to salah_jawaban cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-memberikan",
          ketidaksesuaian:
            "Agent tidak sesuai dalam memberikan informasi produk.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("salah_jawaban");
  });

  it("maps 'tidak menanyakan' phrase to kurang_menggali cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-menanyakan",
          ketidaksesuaian:
            "Agent tidak menanyakan kronologi kejadian kepada nasabah.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("kurang_menggali");
  });

  it("includes nilai 3 rows with evidence in root cause derivation", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-nilai3",
          nilai: 3,
          ketidaksesuaian: "Sebaiknya agent melakukan verifikasi data nasabah.",
        }),
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].clusterId).toBe("kurang_teliti_verifikasi_data");
    expect(result[0].findingsCount).toBe(1);
    expect(result[0].averageNilai).toBe(3);
    expect(result[0].criticalFindingsCount).toBe(0);
  });

  it("maps 'tidak sesuai dalam menuliskan' to salah_jawaban cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-menuliskan",
          ketidaksesuaian: "Agent tidak sesuai dalam menuliskan nama konsumen.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("salah_jawaban");
  });

  it("maps APPK system mention to salah_penggunaan_sistem cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-appk-1",
          ketidaksesuaian:
            "Agent tidak lengkap dalam mencatat keterangan pada kolom Deskripsi di APPK.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("salah_penggunaan_sistem");
  });

  it("maps 'pada appk' mention to salah_penggunaan_sistem cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-appk-2",
          ketidaksesuaian:
            "Agent tidak sesuai dalam memilih data kontak pada APPK.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("salah_penggunaan_sistem");
  });

  it("keeps kelebihan_standar_jawaban ahead of APPK when both priority-9 clusters match", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-appk-sj",
          ketidaksesuaian:
            "Agent memakai standar jawaban tidak diperlukan pada APPK.",
        }),
      ],
    });

    expect(result[0]).toMatchObject({
      clusterId: "kelebihan_standar_jawaban",
      priority: 9,
    });
  });

  it("preserves existing cluster matching for non-APPK rows", () => {
    // Row without APPK should still match existing cluster
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-no-appk",
          ketidaksesuaian: "Salah memilih jenis produk yang tersedia.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("salah_jawaban");
  });

  it("maps 'tidak sesuai dalam menyampaikan' to salah_jawaban cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-menyampaikan",
          ketidaksesuaian: "Agent tidak sesuai dalam menyampaikan informasi.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("salah_jawaban");
  });

  it("maps 'salah menulis' to salah_jawaban cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-salah-tulis",
          ketidaksesuaian: "Salah menulis nama konsumen pada email balasan.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("salah_jawaban");
  });

  it("maps 'tidak sesuai dalam melakukan' to salah_jawaban cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-melakukan",
          ketidaksesuaian: "Agent tidak sesuai dalam melakukan HOLD pertama.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("salah_jawaban");
  });

  it("maps 'belum memperbaiki' to salah_jawaban cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-belum",
          ketidaksesuaian: "Agent belum memperbaiki kolom jenis produk.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("salah_jawaban");
  });

  it("maps 'tidak melakukan probing' to kurang_menggali cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-probing",
          ketidaksesuaian:
            "Agent tidak melakukan probing lanjutan kepada konsumen.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("kurang_menggali");
  });

  it("maps 'tidak melampirkan' to kurang_teliti_verifikasi_data cluster", () => {
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-melampirkan",
          ketidaksesuaian: "Agent tidak melampirkan attachment dokumen.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("kurang_teliti_verifikasi_data");
  });

  it("does NOT overmatch generic 'tidak sesuai' standalone", () => {
    // "tidak sesuai" alone is too generic; should still fall to lainnya
    const result = deriveAgentRootCauses({
      indicators,
      periodById,
      temuan: [
        row({
          id: "r-generic",
          ketidaksesuaian: "Tidak sesuai pada bagian yang disampaikan.",
        }),
      ],
    });

    expect(result[0].clusterId).toBe("lainnya");
  });
});
