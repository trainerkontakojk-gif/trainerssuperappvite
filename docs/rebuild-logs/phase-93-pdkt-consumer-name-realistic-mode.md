# Phase 93: PDKT Consumer Name & Realistic Mode Hardening

**Goal:** Ensure the consumer name mention pattern and realistic writing style settings are strictly enforced during PDKT template generation (`/pdkt/generate-template`) and session initialization, preventing leakages of AI meta-language or out-of-position name introductions.

## Implementation Details

### Centralized Policy Module
- **New Module:** Created `apps/api/src/services/pdkt-email-policy.ts` to act as the single source of truth for PDKT prompt blocks, position rules, and compliance validators.
- **Helper Extraction:** Refactored `pdkt-service.ts` to delegate prompt generation helper calls (`getRealisticWritingInstruction`, `getConsumerNameMentionInstruction`, `getCompanyNameInstruction`, `getSystemInstruction`) to the new policy module, avoiding circular dependencies and preventing code duplication.
- **Mention Position Rules:** Implemented positioning logic in `renderPdktIdentityByMentionPattern` for `upfront`, `middle`, `late`, and `none` patterns. For `none`, placeholders are stripped and actual name mentions are completely purged.

### Template & Session Integration
- **Placeholder Handling:** Refactored `pdkt-template-resolver.ts` to prevent premature consumer name placeholder replacement in `sanitizePdktTemplateText`. Placeholders are now resolved safely under the positioning rules of the policy.
- **Dynamic System Prompts:** Modified `/pdkt/generate-template` and `initializeEmailSession` to build prompts using the policy system instructions, embedding correct name positioning rules and realistic style guidelines.
- **Compliance Validation & Retry:** Added compliance validation for meta-language and mention patterns. If the generated output fails validation, the system retries once with corrective prompt feedback instructions, and now fails closed if the retry still violates the policy.

## Verification Results

### Automated Tests
- API Tests: `pdkt-email-policy.test.ts`, `pdkt-template-resolver.test.ts`, `pdkt.test.ts` (514 passed, 1 skipped)
- Web Tests: `pdkt-landing.test.tsx`, `pdkt-mailbox.test.ts`, `pdkt-mailbox.test.tsx`, `pdkt-settings-modal.test.tsx`, `pdkt-settings.test.ts` (unchanged)

## Structural Changes
- Decomposed prompt generation and placement logic into `apps/api/src/services/pdkt-email-policy.ts`.
- Simplified consumer placeholder handling in `apps/api/src/services/pdkt-template-resolver.ts` to respect `ResolvedConsumerNameMentionPattern`.
