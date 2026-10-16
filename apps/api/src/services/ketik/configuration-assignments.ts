import {
  KETIK_ERROR_MESSAGES,
  ketikTrainingConfigurationSchema,
  type AssignKetikConfiguration,
  type KetikAssignmentSnapshot,
  type KetikConfigurationAssignment,
} from "@trainers/types";
import type { Actor } from "../../middleware/role";
import { createAdminClient } from "../../lib/supabase";
import { ABSENT_SETTINGS_VERSION } from "../../lib/guarded-user-settings";
import { getSettingsSnapshot } from "./settings-history";

const assignmentErrors = {
  ASSIGNMENT_CONFLICT: 409,
  ASSIGNMENT_FORBIDDEN: 403,
  ASSIGNMENT_INVALID_RECIPIENT: 404,
  ASSIGNMENT_INVALID_CONFIGURATION: 400,
} as const;

export class KetikAssignmentError extends Error {
  readonly status;
  constructor(readonly code: keyof typeof assignmentErrors) {
    super(KETIK_ERROR_MESSAGES[code]);
    this.name = "KetikAssignmentError";
    this.status = assignmentErrors[code];
  }
}

type AssignmentRow = {
  recipient_id: string;
  assigned_by: string;
  source_configuration: unknown;
  source_settings_version: string;
  version: string;
  assigned_at: string;
};
function toAssignment(row: AssignmentRow): KetikConfigurationAssignment {
  return {
    recipientId: row.recipient_id,
    assignedBy: row.assigned_by,
    sourceConfiguration: ketikTrainingConfigurationSchema.parse(
      row.source_configuration,
    ),
    sourceSettingsVersion: row.source_settings_version,
    version: row.version,
    assignedAt: row.assigned_at,
  };
}

async function recipientSettingsVersion(recipientId: string): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("user_settings")
    .select("updated_at")
    .eq("user_id", recipientId)
    .maybeSingle();
  if (error) throw error;
  return data?.updated_at ?? ABSENT_SETTINGS_VERSION;
}

export async function getKetikAssignment(
  actor: Actor,
  recipientId: string,
): Promise<KetikAssignmentSnapshot> {
  const self = actor.id === recipientId;
  if (!self && actor.role !== "admin" && actor.role !== "trainer") {
    throw new KetikAssignmentError("ASSIGNMENT_FORBIDDEN");
  }
  const { data, error } = await createAdminClient()
    .from("ketik_configuration_assignments")
    .select("*")
    .eq("recipient_id", recipientId)
    .maybeSingle();
  if (error) throw error;
  if (
    data &&
    !self &&
    actor.role !== "admin" &&
    data.assigned_by !== actor.id
  ) {
    throw new KetikAssignmentError("ASSIGNMENT_FORBIDDEN");
  }
  return {
    assignment: data ? toAssignment(data) : null,
    recipientSettingsVersion: await recipientSettingsVersion(recipientId),
  };
}

export async function assignKetikConfiguration(
  actor: Actor,
  recipientId: string,
  request: AssignKetikConfiguration,
): Promise<
  KetikAssignmentSnapshot & { assignment: KetikConfigurationAssignment }
> {
  if (actor.role !== "admin" && actor.role !== "trainer") {
    throw new KetikAssignmentError("ASSIGNMENT_FORBIDDEN");
  }
  const source = await getSettingsSnapshot(actor.id);
  if (request.sourceSettingsVersion !== source.version) {
    throw new KetikAssignmentError("ASSIGNMENT_CONFLICT");
  }
  // Parsing strips identity and template fields; never accept source data from
  // the request or copy the trainer's entire user_settings namespace.
  const configuration = ketikTrainingConfigurationSchema.parse(source.settings);
  if (
    !configuration.scenarios.some((scenario) => scenario.isActive) ||
    (configuration.activeConsumerTypeId !== "random" &&
      !configuration.consumerTypes.some(
        (consumer) => consumer.id === configuration.activeConsumerTypeId,
      ))
  ) {
    throw new KetikAssignmentError("ASSIGNMENT_INVALID_CONFIGURATION");
  }
  const { data, error } = await createAdminClient().rpc(
    "assign_ketik_configuration",
    {
      p_actor_id: actor.id,
      p_recipient_id: recipientId,
      p_source_settings_version: request.sourceSettingsVersion,
      p_recipient_settings_version: request.recipientSettingsVersion,
      p_expected_assignment_version: request.expectedAssignmentVersion,
      p_configuration: configuration,
    },
  );
  if (error) {
    switch (error.code) {
      case "PT403":
        throw new KetikAssignmentError("ASSIGNMENT_FORBIDDEN");
      case "PT404":
        throw new KetikAssignmentError("ASSIGNMENT_INVALID_RECIPIENT");
      case "PT409":
        throw new KetikAssignmentError("ASSIGNMENT_CONFLICT");
      default:
        throw error;
    }
  }
  if (!data) throw new Error("Missing assignment publication");
  return {
    assignment: toAssignment(data),
    recipientSettingsVersion: await recipientSettingsVersion(recipientId),
  };
}
