import {
  normalizeSimulationSubjectSelection,
  type SimulationSubjectSnapshot,
} from "@trainers/types";

export type SimulationSubjectActor = {
  id?: string | null;
  role?: string | null;
  full_name?: string | null;
  status?: string | null;
  is_deleted?: boolean | null;
};

export type SimulationSubjectPeserta = {
  id: string;
  nama: string;
  batch_name?: string | null;
  tim?: string | null;
};

export type SimulationSubjectDeps = {
  getProfileDisplayName?: (actorId: string) => Promise<string | null>;
  getPesertaById?: (id: string) => Promise<SimulationSubjectPeserta | null>;
};

export class SimulationSubjectError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizedRole(role?: string | null): string {
  return (role ?? "").toLowerCase().trim();
}

function isManagerRole(role?: string | null): boolean {
  return normalizedRole(role) === "admin" || normalizedRole(role) === "trainer";
}

function safeSelfName(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed : "Diri sendiri";
}

/**
 * Backend resolver: actor dari middleware + selection, tanpa snapshot trusted browser.
 * - Self: identitas actor terverifikasi, participantId/batch/tim null.
 * - Participant: cek admin/trainer, lookup minimal id,nama,batch_name,tim.
 * Error contract: 401 tanpa auth valid, 400 malformed, 403 role/status,
 * 404 peserta hilang, 500 DB/service unavailable (human-friendly).
 */
export async function resolveSimulationSubjectSnapshot(
  actor: SimulationSubjectActor | null | undefined,
  selectionInput: unknown,
  deps: SimulationSubjectDeps = {},
): Promise<SimulationSubjectSnapshot> {
  if (!actor?.id) {
    throw new SimulationSubjectError(
      401,
      "UNAUTHORIZED",
      "Autentikasi diperlukan.",
    );
  }
  if (actor.is_deleted) {
    throw new SimulationSubjectError(403, "FORBIDDEN", "Akun tidak aktif.");
  }
  if (
    actor.status &&
    !["active", "approved"].includes(normalizedRole(actor.status))
  ) {
    throw new SimulationSubjectError(403, "FORBIDDEN", "Akun tidak aktif.");
  }

  let selection;
  try {
    selection = normalizeSimulationSubjectSelection(selectionInput);
  } catch {
    throw new SimulationSubjectError(
      400,
      "VALIDATION_ERROR",
      "Pilihan peserta tidak valid.",
    );
  }

  if (selection.type === "self") {
    let displayName: string | null;
    try {
      if (deps.getProfileDisplayName) {
        displayName = await deps.getProfileDisplayName(actor.id);
      } else {
        displayName = actor.full_name ?? null;
      }
    } catch (_e) {
      throw new SimulationSubjectError(
        500,
        "SERVER_ERROR",
        "Gagal memuat profil. Coba lagi.",
      );
    }
    return {
      type: "self",
      participantId: null,
      displayName: safeSelfName(displayName ?? actor.full_name),
      batchName: null,
      team: null,
    };
  }

  // participant
  if (!isManagerRole(actor.role)) {
    throw new SimulationSubjectError(
      403,
      "FORBIDDEN",
      "Hanya admin/trainer yang dapat memilih peserta.",
    );
  }
  let peserta: SimulationSubjectPeserta | null;
  try {
    if (!deps.getPesertaById) {
      throw new SimulationSubjectError(
        500,
        "SERVER_ERROR",
        "Layanan peserta tidak tersedia.",
      );
    }
    peserta = await deps.getPesertaById(selection.participantId);
  } catch (err) {
    if (err instanceof SimulationSubjectError) throw err;
    throw new SimulationSubjectError(
      500,
      "SERVER_ERROR",
      "Gagal memuat data peserta. Coba lagi.",
    );
  }
  if (!peserta) {
    throw new SimulationSubjectError(
      404,
      "NOT_FOUND",
      "Peserta tidak ditemukan.",
    );
  }
  const nama = (peserta.nama ?? "").trim();
  if (!nama) {
    throw new SimulationSubjectError(
      400,
      "VALIDATION_ERROR",
      "Data peserta tidak valid.",
    );
  }
  return {
    type: "participant",
    participantId: peserta.id,
    displayName: nama,
    batchName: peserta.batch_name ?? null,
    team: peserta.tim ?? null,
  };
}
