/**
 * Cakupan bersama halaman analitik SIDAK: layanan, tahun, rentang bulan, dan
 * tim/folder.
 *
 * Sumber kebenaran adalah query URL (`?layanan=call&tahun=2026&dari=1&sampai=10
 * &tim=…`), jadi tautan bisa dibagikan dan tombol kembali bekerja. Cakupan
 * terakhir juga disimpan di `sessionStorage` supaya ikut terbawa ketika pindah
 * halaman lewat sidebar (yang tidak membawa query). Urutan: URL → sesi →
 * bawaan (layanan `call`, tahun berjalan, Januari s.d. bulan ini, tim belum
 * dipilih).
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { VALID_SERVICE_TYPES, type ServiceType } from "@trainers/types";

/** `tim=ALL` berarti "semua tim" dipilih sengaja; kosong berarti belum dipilih. */
export const SIDAK_ALL_TEAMS = "ALL";

export interface SidakScopeSearch {
  layanan?: ServiceType;
  tahun?: number;
  dari?: number;
  sampai?: number;
  tim?: string;
}

export interface SidakScope {
  layanan: ServiceType;
  tahun: number;
  dari: number;
  sampai: number;
  /** ID folder, `ALL`, atau null bila belum dipilih (halaman memasangkan bawaan). */
  tim: string | null;
}

const STORAGE_KEY = "sidak.scope";
const SCOPE_KEYS = ["layanan", "tahun", "dari", "sampai", "tim"] as const;
const TEAM_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function toMonth(value: unknown): number | undefined {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12
    ? month
    : undefined;
}

/**
 * Validasi query cakupan. Nilai yang tidak dikenal dibuang, bukan diteruskan,
 * supaya URL yang diedit tangan tidak memasukkan bentuk yang tidak divalidasi.
 */
export function validateSidakScopeSearch(
  search: Record<string, unknown>,
): SidakScopeSearch {
  const result: SidakScopeSearch = {};
  const layanan = VALID_SERVICE_TYPES.find((value) => value === search.layanan);
  if (layanan) result.layanan = layanan;
  // Router mem-parse `tahun=2026` sebagai angka; `tahun=20x6` tetap string.
  if (/^\d{4}$/.test(String(search.tahun))) result.tahun = Number(search.tahun);
  const dari = toMonth(search.dari);
  const sampai = toMonth(search.sampai);
  if (dari !== undefined && sampai !== undefined && dari <= sampai) {
    result.dari = dari;
    result.sampai = sampai;
  }
  if (typeof search.tim === "string" && TEAM_PATTERN.test(search.tim)) {
    result.tim = search.tim;
  }
  return result;
}

function readStored(): SidakScopeSearch {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return validateSidakScopeSearch(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return {};
  }
}

function writeStored(scope: SidakScopeSearch) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
  } catch {
    // Penyimpanan sesi diblokir: cakupan tetap hidup di URL.
  }
}

function pickScope(search: Record<string, unknown>): SidakScopeSearch {
  const picked: Record<string, unknown> = {};
  for (const key of SCOPE_KEYS) {
    if (search[key] !== undefined) picked[key] = search[key];
  }
  return validateSidakScopeSearch(picked);
}

export function defaultSidakScope(now = new Date()): SidakScope {
  return {
    layanan: "call",
    tahun: now.getFullYear(),
    dari: 1,
    sampai: now.getMonth() + 1,
    tim: null,
  };
}

/** Query untuk tautan antarhalaman SIDAK yang membawa cakupan aktif. */
export function sidakScopeToSearch(scope: SidakScope): SidakScopeSearch {
  return {
    layanan: scope.layanan,
    tahun: scope.tahun,
    dari: scope.dari,
    sampai: scope.sampai,
    ...(scope.tim ? { tim: scope.tim } : {}),
  };
}

export interface UseSidakScopeResult {
  scope: SidakScope;
  /** Kunci yang benar-benar dipilih (URL atau sesi), bukan bawaan. */
  explicit: SidakScopeSearch;
  setScope: (patch: Partial<SidakScope>) => void;
  resetScope: () => void;
}

export function useSidakScope(): UseSidakScopeResult {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const navigate = useNavigate();

  const fromUrl = useMemo(() => pickScope(search), [search]);
  const hasUrlScope = Object.keys(fromUrl).length > 0;
  const explicit = useMemo(
    () => (hasUrlScope ? fromUrl : readStored()),
    [fromUrl, hasUrlScope],
  );
  const scope = useMemo<SidakScope>(
    () => ({ ...defaultSidakScope(), ...explicit, tim: explicit.tim ?? null }),
    [explicit],
  );

  const writeUrl = useCallback(
    (next: SidakScopeSearch) => {
      const rest: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(search)) {
        if (!(SCOPE_KEYS as readonly string[]).includes(key)) rest[key] = value;
      }
      void navigate({
        to: pathname as never,
        search: { ...rest, ...next } as never,
        replace: true,
      });
    },
    [navigate, pathname, search],
  );

  // Cakupan dari sesi ditulis ke URL supaya halaman yang dibuka lewat sidebar
  // tetap bisa dibagikan apa adanya.
  useEffect(() => {
    if (hasUrlScope) {
      writeStored(fromUrl);
      return;
    }
    if (Object.keys(explicit).length > 0) writeUrl(explicit);
  }, [explicit, fromUrl, hasUrlScope, writeUrl]);

  // Beberapa perubahan dalam satu render (mis. layanan lalu tim) digabung di
  // sini; tanpa ini panggilan kedua menimpa yang pertama dengan cakupan lama.
  const pendingRef = useRef<SidakScope | null>(null);
  useEffect(() => {
    pendingRef.current = null;
  }, [scope]);

  const setScope = useCallback(
    (patch: Partial<SidakScope>) => {
      const merged: SidakScope = { ...(pendingRef.current ?? scope), ...patch };
      pendingRef.current = merged;
      const next = validateSidakScopeSearch({ ...sidakScopeToSearch(merged) });
      writeStored(next);
      writeUrl(next);
    },
    [scope, writeUrl],
  );

  /** Kembali ke bawaan: query cakupan dan cakupan sesi dihapus. */
  const resetScope = useCallback(() => {
    pendingRef.current = null;
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Penyimpanan sesi diblokir: cukup bersihkan URL.
    }
    writeUrl({});
  }, [writeUrl]);

  return { scope, explicit, setScope, resetScope };
}
