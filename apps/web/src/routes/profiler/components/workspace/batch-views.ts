/** Tab workspace batch yang dirender di halaman (`?view=`); tanpa view = Peserta. */
export type ProfilerBatchView = "statistik" | "slide" | "ekspor";

export const PROFILER_BATCH_VIEWS: readonly ProfilerBatchView[] = [
  "statistik",
  "slide",
  "ekspor",
];

export function parseProfilerBatchView(
  value: string | undefined,
): ProfilerBatchView | null {
  return PROFILER_BATCH_VIEWS.includes(value as ProfilerBatchView)
    ? (value as ProfilerBatchView)
    : null;
}
