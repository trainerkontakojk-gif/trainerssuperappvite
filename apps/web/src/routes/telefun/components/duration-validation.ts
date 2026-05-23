export const MIN_DURATION = 1;
export const MAX_DURATION = 60;
export const DEFAULT_DURATION = 5;
export const PRESET_DURATIONS = [5, 10, 15] as const;

export function filterDurationInput(input: string): string {
  return input.replace(/\D/g, '');
}

export function normalizeDurationDisplay(input: string): string {
  if (!input || input.trim() === '') return '';
  const parsed = Number(input);
  if (isNaN(parsed)) return input;
  return Math.floor(parsed).toString();
}

export function validateDuration(value: unknown): {
  valid: boolean;
  value: number;
  error: string | null;
} {
  if (value === null || value === undefined || value === '') {
    return { valid: false, value: 0, error: 'Durasi wajib diisi' };
  }
  const num = Number(value);
  if (isNaN(num)) {
    return { valid: false, value: 0, error: 'Durasi wajib diisi' };
  }
  if (num < MIN_DURATION) {
    return { valid: false, value: num, error: 'Durasi minimal adalah 1 menit' };
  }
  if (num > MAX_DURATION) {
    return {
      valid: false,
      value: num,
      error: 'Durasi maksimal adalah 60 menit',
    };
  }
  return { valid: true, value: num, error: null };
}

export function isPresetDuration(value: number): boolean {
  return PRESET_DURATIONS.includes(value as any);
}

export function coerceDuration(raw: unknown): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return DEFAULT_DURATION;
  }
  if (typeof raw === 'string' && raw.trim() === '') {
    return DEFAULT_DURATION;
  }
  const num = Number(raw);
  if (isNaN(num) || !Number.isInteger(num)) return DEFAULT_DURATION;
  if (num < MIN_DURATION || num > MAX_DURATION) return DEFAULT_DURATION;
  return num;
}

export function classifyDurationMode(value: unknown): {
  mode: 'preset' | 'custom';
  value: number;
} {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_DURATION &&
    value <= MAX_DURATION
  ) {
    if (isPresetDuration(value)) {
      return { mode: 'preset', value };
    }
    return { mode: 'custom', value };
  }
  return { mode: 'preset', value: DEFAULT_DURATION };
}
