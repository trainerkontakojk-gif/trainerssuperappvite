/**
 * Tim bawaan SIDAK untuk kunjungan yang belum memilih tim (`tim` kosong).
 *
 * Tim dipilih dari `/sidak/folders`, daftar tim yang sudah di-scope untuk
 * leader, SEBELUM halaman memuat datanya, jadi data dimuat sekali dan langsung
 * dengan tim bawaan. Tanpa kecocokan (atau bila daftar gagal dimuat) halaman
 * memuat "Semua tim" dan `tim` tetap kosong. Bila layanan berubah selagi `tim`
 * kosong (mis. layanan leader yang terkunci), tim dicari ulang untuk layanan
 * itu.
 */

import { useEffect, useState } from "react";
import { useApi } from "./useApi";
import type { SidakScope } from "./useSidakScope";
import { DEFAULT_SERVICE_FOLDER_MAP } from "../lib/scoring";
import {
  findPrimarySidakFolderByName,
  type SidakFolderOption,
} from "../lib/sidak-folder-options";

/** `true` bila halaman boleh memuat data dengan cakupan tim sekarang. */
export function useSidakDefaultTeam(
  scope: SidakScope,
  setScope: (patch: Partial<SidakScope>) => void,
): boolean {
  const unresolved = scope.tim === null;
  const { data: folders, error } = useApi<SidakFolderOption[]>(
    unresolved ? "/sidak/folders" : null,
  );
  const [resolvedService, setResolvedService] = useState<string | null>(null);

  useEffect(() => {
    if (!unresolved) return;
    if (error) {
      setResolvedService(scope.layanan);
      return;
    }
    if (!folders) return;
    const match = findPrimarySidakFolderByName(
      folders,
      DEFAULT_SERVICE_FOLDER_MAP[scope.layanan],
    );
    if (match) setScope({ tim: match.id });
    else setResolvedService(scope.layanan);
  }, [unresolved, folders, error, scope.layanan, setScope]);

  return !unresolved || resolvedService === scope.layanan;
}
