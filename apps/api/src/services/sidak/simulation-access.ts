import type {
  ServiceType,
  SidakSimulationModule,
} from "@trainers/types";
import { getAccessibleSidakFilters } from "./access-scope";
import { TRAINER_ROLES } from "./shared-constants";

const SERVICE_TO_SIMULATION_MODULE: Partial<
  Record<ServiceType, SidakSimulationModule>
> = {
  chat: "ketik",
  email: "pdkt",
  call: "telefun",
};

const ALL_SIMULATION_MODULES: SidakSimulationModule[] = [
  "ketik",
  "pdkt",
  "telefun",
];

export interface SidakSimulationAccess {
  agentId: string;
  role: string;
  modules: readonly SidakSimulationModule[];
  canPlayTelefunRecording: boolean;
}

export class SidakSimulationAccessError extends Error {
  readonly status: 403 | 503;
  readonly code: "FORBIDDEN" | "SCOPE_UNAVAILABLE";

  constructor(
    message: string,
    options: {
      status: 403 | 503;
      code: "FORBIDDEN" | "SCOPE_UNAVAILABLE";
    },
  ) {
    super(message);
    this.name = "SidakSimulationAccessError";
    this.status = options.status;
    this.code = options.code;
  }
}

export function getSidakSimulationModuleForService(
  serviceType: ServiceType,
): SidakSimulationModule | null {
  return SERVICE_TO_SIMULATION_MODULE[serviceType] ?? null;
}

type SidakSimulationAccessLike = Pick<
  SidakSimulationAccess,
  "role" | "modules"
>;

export function canReadSidakSimulationModule(
  access: SidakSimulationAccessLike,
  module: SidakSimulationModule,
): boolean {
  return (
    (TRAINER_ROLES as readonly string[]).includes(access.role) ||
    access.modules.includes(module)
  );
}

export function canPlaySidakTelefunRecording(
  access: SidakSimulationAccessLike,
): boolean {
  return (
    (TRAINER_ROLES as readonly string[]).includes(access.role) ||
    access.modules.includes("telefun")
  );
}

function failClosedScopeError(): SidakSimulationAccessError {
  return new SidakSimulationAccessError(
    "Scope SIDAK tidak dapat diverifikasi. Silakan coba lagi.",
    { status: 503, code: "SCOPE_UNAVAILABLE" },
  );
}

export async function resolveSidakSimulationAccess(params: {
  userId: string;
  role: string;
  agentId: string;
}): Promise<SidakSimulationAccess> {
  const role = params.role.toLowerCase();

  if ((TRAINER_ROLES as readonly string[]).includes(role)) {
    return {
      agentId: params.agentId,
      role,
      modules: ALL_SIMULATION_MODULES,
      canPlayTelefunRecording: true,
    };
  }

  if (role !== "leader") {
    throw new SidakSimulationAccessError(
      "Anda tidak memiliki akses ke riwayat simulasi SIDAK.",
      { status: 403, code: "FORBIDDEN" },
    );
  }

  let scope;
  try {
    scope = await getAccessibleSidakFilters(params.userId, role);
  } catch {
    throw failClosedScopeError();
  }

  if (!scope || scope.agentIds.length === 0 || scope.allowedServices.length === 0) {
    throw new SidakSimulationAccessError(
      "Scope SIDAK Anda kosong atau belum disetujui.",
      { status: 403, code: "FORBIDDEN" },
    );
  }

  if (!scope.agentIds.includes(params.agentId)) {
    throw new SidakSimulationAccessError(
      "Anda tidak memiliki akses ke data agent ini.",
      { status: 403, code: "FORBIDDEN" },
    );
  }

  const modules = [
    ...new Set(
      scope.allowedServices
        .map(getSidakSimulationModuleForService)
        .filter((module): module is SidakSimulationModule => module !== null),
    ),
  ];

  if (modules.length === 0) {
    throw new SidakSimulationAccessError(
      "Scope SIDAK Anda tidak mencakup layanan simulasi.",
      { status: 403, code: "FORBIDDEN" },
    );
  }

  return {
    agentId: params.agentId,
    role,
    modules,
    canPlayTelefunRecording: modules.includes("telefun"),
  };
}
