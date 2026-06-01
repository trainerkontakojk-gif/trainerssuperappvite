export type UsageCategory = "simulation" | "review" | "uncategorized";

export interface UsageActionDefinition {
  action: string;
  category: UsageCategory;
  itemKey: string;
  itemLabel: string;
}

export const USAGE_ACTION_DEFINITIONS: UsageActionDefinition[] = [
  { action: "chat_response", category: "simulation", itemKey: "simulation_chat", itemLabel: "Simulasi" },
  { action: "ai_generate", category: "simulation", itemKey: "simulation", itemLabel: "Simulasi" },
  { action: "generate_consumer_response", category: "simulation", itemKey: "ketik_consumer_response", itemLabel: "Simulasi Chat" },
  { action: "session_timeout", category: "simulation", itemKey: "simulation", itemLabel: "Simulasi" },
  { action: "init_email", category: "simulation", itemKey: "pdkt_create_email", itemLabel: "Create Email" },
  { action: "generate_template", category: "simulation", itemKey: "pdkt_template", itemLabel: "Template Email" },
  { action: "generate_ai_images", category: "simulation", itemKey: "pdkt_image_generation", itemLabel: "Lampiran AI" },
  { action: "generate_scenario_images", category: "simulation", itemKey: "pdkt_image_generation", itemLabel: "Lampiran AI" },
  { action: "voice_live", category: "simulation", itemKey: "telefun_live", itemLabel: "Simulasi Voice" },
  { action: "coaching_review", category: "review", itemKey: "ketik_review", itemLabel: "Penilaian AI" },
  { action: "evaluate_response", category: "review", itemKey: "pdkt_review", itemLabel: "Penilaian AI" },
  { action: "async_evaluate_agent_response", category: "review", itemKey: "pdkt_review", itemLabel: "Penilaian AI" },
  { action: "voice_assessment", category: "review", itemKey: "telefun_assessment", itemLabel: "Penilaian AI" },
  { action: "coaching_summary", category: "review", itemKey: "coaching_summary", itemLabel: "Coaching Summary" },
];

const ACTION_DEFINITION_MAP = new Map(
  USAGE_ACTION_DEFINITIONS.map((definition) => [definition.action, definition]),
);

export function getUsageActionDefinition(action: string): UsageActionDefinition {
  return (
    ACTION_DEFINITION_MAP.get(action) || {
      action,
      category: "uncategorized",
      itemKey: "uncategorized",
      itemLabel: "Lainnya",
    }
  );
}

export function isUsageActionInCategory(action: string, category: UsageCategory): boolean {
  return getUsageActionDefinition(action).category === category;
}
