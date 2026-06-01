/**
 * PDKT Service Facade
 *
 * This file serves as a backward-compatible entry point for PDKT services.
 * Responsibilities are decomposed into specialized modules under ./pdkt/.
 */

export * from "./pdkt/catalog-service";
export * from "./pdkt/shared-utils";
export * from "./pdkt/mailbox-service";
export * from "./pdkt/session-service";
export * from "./pdkt/evaluation-service";

// Internal library re-exports
export { parseJsonFromModelText } from "../lib/ai-json";
