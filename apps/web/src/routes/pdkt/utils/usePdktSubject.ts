import { useCallback, useEffect, useState } from "react";
import {
  simulationSubjectSelectionSchema,
  type SimulationSubjectSelection,
} from "@trainers/types";

function readSubject(
  accountKey: string | null,
  canPickParticipant: boolean,
): SimulationSubjectSelection {
  if (!accountKey || !canPickParticipant) return { type: "self" };
  try {
    const saved = sessionStorage.getItem(`pdkt_subject_${accountKey}`);
    const parsed = simulationSubjectSelectionSchema.safeParse(
      saved ? JSON.parse(saved) : null,
    );
    if (parsed.success) return parsed.data;
  } catch {
    /* Storage dapat diblokir atau berisi data lama. */
  }
  return { type: "self" };
}

/** Pilihan untuk email baru, terpisah dari snapshot peserta email yang dibuka. */
export function usePdktSubject(
  accountKey: string | null,
  canPickParticipant: boolean,
) {
  const [stored, setStored] = useState(() => ({
    accountKey,
    selection: readSubject(accountKey, canPickParticipant),
  }));
  useEffect(() => {
    setStored({
      accountKey,
      selection: readSubject(accountKey, canPickParticipant),
    });
  }, [accountKey, canPickParticipant]);
  const selectSubject = useCallback(
    (selection: SimulationSubjectSelection) => {
      const next = canPickParticipant ? selection : { type: "self" as const };
      setStored({ accountKey, selection: next });
      if (!accountKey) return;
      try {
        sessionStorage.setItem(
          `pdkt_subject_${accountKey}`,
          JSON.stringify(next),
        );
      } catch {
        /* Pilihan tetap berlaku selama komponen terpasang. */
      }
    },
    [accountKey, canPickParticipant],
  );
  const selection: SimulationSubjectSelection =
    stored.accountKey === accountKey && canPickParticipant
      ? stored.selection
      : { type: "self" };
  return [selection, selectSubject] as const;
}
