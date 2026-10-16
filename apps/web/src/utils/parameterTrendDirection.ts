export type ParameterDirectionTone = "bad" | "ok" | "neutral";

/**
 * Arah temuan satu parameter dari deret bulanan, dalam kata, untuk kolom
 * "Arah" di tab Tren detail agen. Temuan naik = memburuk (merah).
 */
export function parameterDirection(values: number[]): {
  label: string;
  tone: ParameterDirectionTone;
} {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return { label: "Tidak ada temuan", tone: "neutral" };
  if (values.length >= 3) {
    const [a, b, c] = values.slice(-3);
    if (a < b && b < c) {
      return { label: "Naik 3 bulan berturut-turut", tone: "bad" };
    }
    if (a > b && b > c) {
      return { label: "Turun 3 bulan berturut-turut", tone: "ok" };
    }
  }
  // Muncul lagi: bulan terakhir ada temuan setelah sedikitnya dua bulan nol,
  // dan parameter ini pernah muncul sebelum jeda itu.
  const last = values[values.length - 1];
  if (last > 0) {
    let gap = 0;
    for (let i = values.length - 2; i >= 0 && values[i] === 0; i--) gap++;
    const before = values.slice(0, values.length - 1 - gap);
    if (gap >= 2 && before.some((value) => value > 0)) {
      return { label: "Muncul lagi", tone: "bad" };
    }
  }
  if (Math.max(...values) - Math.min(...values) <= 1) {
    return { label: "Stabil", tone: "neutral" };
  }
  return { label: "Naik turun", tone: "neutral" };
}
