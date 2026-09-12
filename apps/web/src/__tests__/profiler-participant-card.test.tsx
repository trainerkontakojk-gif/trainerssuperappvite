import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProfilerPeserta } from "@trainers/types";

import { ProfilerParticipantCard } from "../routes/profiler/components/table/ProfilerParticipantCard";

const participant: ProfilerPeserta = {
  id: "peserta-1",
  batch_name: "Tim OM",
  nomor_urut: 1,
  nama: "Fajar Abdurrahman",
  tim: "OM",
  jabatan: "trainer",
  foto_url: "https://example.com/fajar.jpg",
};

const defaultProps = {
  p: participant,
  index: 0,
  sortMode: false,
  selectMode: false,
  isSelected: false,
  isDragging: false,
  isDragOver: false,
  toggleSelect: vi.fn(),
  setSelectedPeserta: vi.fn(),
  onViewAnalysis: vi.fn(),
  handleDragStart: vi.fn(),
  handleDragOver: vi.fn(),
  handleDragLeave: vi.fn(),
  handleDragEnd: vi.fn(),
};

describe("ProfilerParticipantCard", () => {
  it("menampilkan foto lebih besar pada density nyaman", () => {
    render(<ProfilerParticipantCard {...defaultProps} density="comfortable" />);

    expect(document.querySelector('[data-slot="avatar"]')).toHaveClass(
      "!size-16",
    );
  });

  it("mempertahankan foto compact agar kartu tetap padat", () => {
    render(<ProfilerParticipantCard {...defaultProps} density="compact" />);

    expect(document.querySelector('[data-slot="avatar"]')).not.toHaveClass(
      "!size-16",
    );
  });
});
