/**
 * Membersihkan label tahun dari imbuhan "Tahun"
 */
export const cleanYearLabel = (label: string) => {
  return label.replace(/Tahun\s+/gi, "").trim();
};
