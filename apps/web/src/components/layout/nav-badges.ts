import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { TnaDueCount } from "@trainers/types";
import { fetchApi } from "../../hooks/useApi";
import { isCapabilityAllowed } from "../../lib/app-config";

/** A count shown beside a nav item, with the sentence screen readers hear. */
export interface NavBadge {
  count: number;
  label: string;
}
type NavBadges = Partial<Record<string, NavBadge>>;

// One shared empty value: a fresh `{}` per render would re-render every nav
// consumer on each shell render.
const NO_BADGES: NavBadges = {};
const NavBadgeContext = createContext<NavBadges>(NO_BADGES);
export const NavBadgeProvider = NavBadgeContext.Provider;
export const useNavBadgeMap = () => useContext(NavBadgeContext);
export const useNavBadge = (itemId: string) => useNavBadgeMap()[itemId];

/**
 * TNA phase 6 K42/P-4: due plans for the TNA entry. Loaded when the shell
 * opens and again on every page inside /tna, where plan status changes; no
 * polling. Zero or a failed request shows no badge and no error.
 */
export function useNavBadges(
  role: string | null | undefined,
  pathname: string,
  enabled: boolean,
): NavBadges {
  const allowed = enabled && isCapabilityAllowed(role, "tna.read");
  const inTna = pathname === "/tna" || pathname.startsWith("/tna/");
  const refreshKey = inTna ? pathname : "outside";
  const [due, setDue] = useState<number | null>(null);

  useEffect(() => {
    if (!allowed) {
      setDue(null);
      return;
    }
    let live = true;
    fetchApi<TnaDueCount>("/tna/plans/due-count")
      .then((data) => live && setDue(data.count))
      .catch(() => live && setDue(null));
    return () => {
      live = false;
    };
  }, [allowed, refreshKey]);

  return useMemo(
    () =>
      due
        ? { tna: { count: due, label: `${due} rencana perlu dievaluasi` } }
        : NO_BADGES,
    [due],
  );
}
