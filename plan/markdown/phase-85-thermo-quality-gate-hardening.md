# Phase 85 Thermo Quality Gate Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the current decomposition branch to a push-ready maintainability standard by fixing lint blockers, removing state mutation/cast-heavy draft flows, centralizing duplicated SIDAK input derivations, and refreshing graph evidence.

**Architecture:** This is a behavior-preserving cleanup pass on top of the existing phase 78-84 decomposition work. The code-judo move is to make draft commits and SIDAK derived models explicit pure boundaries, so tab components and route pages stop carrying duplicate state-shaping branches. Each task must reduce complexity in the touched module; do not add pass-through wrappers that merely move mess around.

**Tech Stack:** TypeScript, React, Vite, Vitest, ESLint 9 flat config, Hono API, Supabase JS, pnpm/Turborepo, Graphify.

---

## 1. Requirement

### Tujuan

Merapikan branch `main` yang saat ini `ahead 6` terhadap `origin/main` setelah dekomposisi besar SIDAK, Telefun, KETIK, dan PDKT. Audit thermo-nuclear terakhir menemukan bahwa arah dekomposisi sudah benar, tetapi branch belum layak approve karena:

| Area | Bukti Saat Audit | Target |
|---|---|---|
| Lint gate | `pnpm lint` gagal di web: `no-useless-assignment`, `prefer-const`, `react-hooks/immutability` | `pnpm lint` 0 error |
| Whitespace gate | `git diff --check origin/main..HEAD` gagal di file Telefun/settings baru | `git diff --check origin/main..HEAD` 0 output |
| Draft settings | `finalSettings = localSettings` lalu field dimutasi | Draft commit return object baru tanpa mutasi state |
| `useCrudForm` boundary | Generic hook memakai `as any`, `JSON.stringify`, dan caller masih duplikasi save logic | Hook diganti/ditingkatkan menjadi typed collection draft helper atau pure helpers yang jelas |
| SIDAK input | `activeIndicators` dan `unlinkedIndicatorIds` dihitung berulang di parent dan hooks | Satu `useSidakInputRuleModel()` menjadi source of truth |
| Graph evidence | `graphify-out/GRAPH_REPORT.md` built from `e667a15f`, HEAD `18fa82d` | Graph report refreshed after cleanup |

### Acceptance Criteria

| # | Kriteria |
|---|---|
| AC-1 | Tidak ada perubahan behavior user-facing pada KETIK, PDKT, Telefun, atau SIDAK input. |
| AC-2 | `pnpm lint` selesai dengan 0 error; warning lama boleh tetap selama tidak berasal dari perubahan phase ini. |
| AC-3 | `git diff --check origin/main..HEAD` selesai tanpa trailing whitespace atau whitespace error. |
| AC-4 | Draft settings save path tidak memutasi object dari `useState`; semua commit draft membangun object baru. |
| AC-5 | Tidak ada `as any` baru di file settings draft/tab yang disentuh; cast existing harus berkurang atau tetap dengan alasan jelas. |
| AC-6 | SIDAK input hanya punya satu source untuk `activeIndicators` dan `unlinkedIndicatorIds`. |
| AC-7 | `graphify-out/GRAPH_REPORT.md` built commit sama dengan `git rev-parse HEAD` setelah semua code changes. |
| AC-8 | Targeted tests untuk settings dan SIDAK input lulus, lalu direct web compile dan root quality gate lulus. |

### Edge Cases

| Edge Case | Guard |
|---|---|
| User membuka modal, mengedit draft, lalu klik close | Unsaved-change confirm tetap muncul jika draft berbeda. |
| User membuat skenario/consumer baru lalu klik `Simpan Perubahan` modal utama tanpa klik save inline | Draft valid tetap ikut tersimpan. |
| User membuat draft invalid lalu klik `Simpan Perubahan` | Modal pindah ke tab terkait, scroll ke form, tampil warning yang sama. |
| User reset defaults | State lokal dan persisted settings tetap kembali ke defaults modul terkait. |
| Telefun selected model berubah | `telefunTransport` tetap mengikuti model terpilih. |
| SIDAK rule version punya indicator tanpa `legacyIndicatorId` | Unlinked indicator guard tetap memblokir save/import. |
| `graphify update .` mengubah report besar | Perubahan graph boleh masuk commit plan ini karena user meminta referensi graph report. |

### Constraint Teknis

- Tidak menambah dependency.
- Tidak menambah migrasi database.
- Tidak mengubah API contract.
- Tidak melakukan redesign UI.
- Tidak menyentuh generated `apps/api/dist`.
- File editing wajib via unified diff.
- Setiap task harus bisa diverifikasi sendiri sebelum lanjut.
- Kalau behavior berubah tanpa sengaja, hentikan dan revert task terakhir.

### Stop Conditions

Berhenti dan laporkan ke user jika salah satu ini terjadi:

| Kondisi | Alasan |
|---|---|
| Targeted settings tests gagal karena behavior expectation lama tidak lagi cocok | Berisiko breaking UX modal |
| SIDAK input tests gagal di rule-version/unlinked indicator path | Berisiko data quality regression |
| `pnpm lint` masih punya error setelah Task 4 | Branch belum bisa push |
| `graphify update .` gagal karena tool tidak tersedia | Plan masih bisa lanjut, tetapi graph evidence harus ditandai blocked |

---

## 2. Design

### File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/src/hooks/useCrudForm.ts` | Modify or replace | Typed collection-draft helper. No `as any`, no state-object mutation, no brittle dirty check for domain defaults. |
| `apps/web/src/hooks/useCollectionDraft.ts` | Create if replacing `useCrudForm` cleanly | Focused helper for add/edit/close/dirty/save of `{ id: string }` collections. |
| `apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts` | Modify | Pure `buildKetikSettingsForSave()` and immutable save flow. |
| `apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts` | Modify | Pure `buildPdktSettingsForSave()` and immutable save flow. |
| `apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts` | Modify | Pure `buildTelefunSettingsForSave()` and immutable save flow. |
| `apps/web/src/routes/pdkt/components/settings/PdktConsumersTab.tsx` | Modify | Remove useless assignment and `any` from consumer save logic. |
| `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx` | Modify | Remove useless assignment and `any` from scenario save logic. |
| `apps/web/src/routes/telefun/components/settings/TelefunConsumersTab.tsx` | Modify | Remove useless assignment, `any`, and trailing whitespace. |
| `apps/web/src/routes/telefun/components/settings/TelefunScenariosTab.tsx` | Modify | Remove useless assignment, `any`, and trailing whitespace. |
| `apps/web/src/routes/sidak/hooks/useSidakInputRuleModel.ts` | Create | Single source for active rule indicators and unlinked IDs. |
| `apps/web/src/routes/sidak/input.tsx` | Modify | Consume `useSidakInputRuleModel()` and remove duplicated `useMemo` blocks. |
| `apps/web/src/__tests__/settings-draft-helpers.test.ts` | Create | Pure helper tests for immutable settings commits. |
| `apps/web/src/__tests__/sidak-input-rule-model.test.ts` | Create | Rule model transformation tests. |
| `docs/rebuild-logs/phase-85-thermo-quality-gate-hardening.md` | Create | Human-readable rebuild note and verification evidence. |
| `graphify-out/GRAPH_REPORT.md` | Modify via `graphify update .` | Fresh graph evidence. |

### Boundary Decision

Prefer pure helpers over clever hooks:

```ts
export function buildPdktSettingsForSave(params: {
  localSettings: AppSettings;
  scenarioDraft: CollectionCommit<PdktScenario>;
  consumerDraft: CollectionCommit<PdktConsumerType>;
  system: PdktSystemDraft;
}): AppSettings {
  return {
    ...params.localSettings,
    scenarios: params.scenarioDraft.items,
    consumerTypes: params.consumerDraft.items,
    enableImageGeneration: params.system.enableImageGeneration,
    globalConsumerTypeId: params.system.globalConsumerTypeId,
    selectedModel: params.system.selectedModel,
    consumerNameMentionPattern: params.system.consumerNameMentionPattern,
    writingStyleMode: params.system.writingStyleMode,
    customIdentity: params.system.customIdentity,
  };
}
```

This is the structural bar: tab components may collect UI state, but final settings construction must be typed, immutable, and testable without rendering the modal.

### SIDAK Rule Model

Create one hook with one pure mapper:

```ts
export function buildSidakInputRuleModel(params: {
  ruleIndicatorsRaw: RuleIndicatorRow[];
  globalIndicators: QAIndicator[];
  selectedService: string;
}): SidakInputRuleModel {
  if (params.ruleIndicatorsRaw.length === 0) {
    return {
      activeIndicators: params.globalIndicators,
      unlinkedIndicatorIds: new Set<string>(),
    };
  }

  const activeIndicators = params.ruleIndicatorsRaw.map((ri) => ({
    id: ri.legacyIndicatorId || ri.ruleIndicatorId,
    service_type: params.selectedService,
    name: ri.name,
    category: ri.category,
    bobot: ri.bobot,
    has_na: ri.has_na,
    ruleIndicatorId: ri.ruleIndicatorId,
    legacyIndicatorId: ri.legacyIndicatorId,
  })) satisfies QAIndicator[];

  const unlinkedIndicatorIds = new Set(
    params.ruleIndicatorsRaw
      .filter((ri) => !ri.legacyIndicatorId)
      .map((ri) => ri.ruleIndicatorId),
  );

  return { activeIndicators, unlinkedIndicatorIds };
}
```

### Verification Strategy

Use direct commands, not prose claims:

```bash
git diff --check origin/main..HEAD
pnpm --filter @trainers/web test -- src/__tests__/settings-draft-helpers.test.ts src/__tests__/sidak-input-rule-model.test.ts src/__tests__/ketik-settings-modal.test.tsx src/__tests__/pdkt-settings-modal.test.tsx src/__tests__/telefun-settings-model-default.test.ts src/__tests__/sidak-input-legacy-refresh.test.tsx src/__tests__/sidak-input-parity.test.tsx
node node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc -p apps/web/tsconfig.app.json --noEmit --pretty false
pnpm lint
pnpm build
pnpm test
```

### Rollback Plan

| Task | Rollback |
|---|---|
| Task 1-2 settings cleanup | Revert only settings helper/tab commits; leave unrelated SIDAK changes intact. |
| Task 3 SIDAK rule model | Revert `useSidakInputRuleModel.ts` and restore inline memos from previous commit. |
| Task 4 whitespace/lint cleanup | Revert only mechanical cleanup if it unexpectedly touches behavior. |
| Task 5 graph/docs | Re-run `graphify update .` after reverted code state or drop graph update commit. |

---

## 3. Tasklist

### Task 1: Characterize Immutable Settings Draft Commits

**Files:**
- Create: `apps/web/src/__tests__/settings-draft-helpers.test.ts`
- Modify: `apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts`
- Modify: `apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts`
- Modify: `apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts`

- [ ] **Step 1: Write failing pure-helper tests**

Create `apps/web/src/__tests__/settings-draft-helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import { buildKetikSettingsForSave } from "../routes/ketik/components/settings/useKetikSettingsDraft";
import { buildPdktSettingsForSave } from "../routes/pdkt/components/settings/usePdktSettingsDraft";
import { buildTelefunSettingsForSave } from "../routes/telefun/components/settings/useTelefunSettingsDraft";
import { DEFAULT_TELEFUN_SETTINGS } from "../routes/telefun/telefunSettings";

describe("settings draft commit helpers", () => {
  it("buildKetikSettingsForSave returns a new object and does not mutate localSettings", () => {
    const original = {
      ...DEFAULT_KETIK_SETTINGS,
      scenarios: [{ ...DEFAULT_KETIK_SETTINGS.scenarios[0], title: "Original" }],
    };
    const nextScenarios = [{ ...original.scenarios[0], title: "Changed" }];

    const result = buildKetikSettingsForSave({
      localSettings: original,
      scenarios: nextScenarios,
      consumerTypes: original.consumerTypes,
      quickTemplates: original.quickTemplates ?? [],
    });

    expect(result).not.toBe(original);
    expect(result.scenarios[0].title).toBe("Changed");
    expect(original.scenarios[0].title).toBe("Original");
  });

  it("buildPdktSettingsForSave preserves system fields while replacing collections immutably", () => {
    const original = {
      scenarios: [{ id: "s1", category: "A", title: "Old", description: "D", isActive: true }],
      consumerTypes: [{ id: "c1", name: "Old", description: "D", difficulty: "Medium", tone: "", isCustom: true }],
      enableImageGeneration: true,
      globalConsumerTypeId: "random",
      selectedModel: "gemini-3.1-flash-lite-preview",
      consumerNameMentionPattern: "random",
      writingStyleMode: "training" as const,
      customIdentity: { senderName: "", bodyName: "", email: "", city: "" },
    };

    const result = buildPdktSettingsForSave({
      localSettings: original,
      scenarios: [{ ...original.scenarios[0], title: "New" }],
      consumerTypes: original.consumerTypes,
      system: {
        enableImageGeneration: false,
        globalConsumerTypeId: "c1",
        selectedModel: "gemini-3.1-flash-lite-preview",
        consumerNameMentionPattern: "always",
        writingStyleMode: "realistic",
        customIdentity: { senderName: "Agent", bodyName: "Agent", email: "a@b.test", city: "Jakarta" },
      },
    });

    expect(result).not.toBe(original);
    expect(result.scenarios[0].title).toBe("New");
    expect(result.enableImageGeneration).toBe(false);
    expect(original.scenarios[0].title).toBe("Old");
    expect(original.enableImageGeneration).toBe(true);
  });

  it("buildTelefunSettingsForSave derives transport from selected model without mutating localSettings", () => {
    const original = {
      ...DEFAULT_TELEFUN_SETTINGS,
      telefunModelId: "gemini-3.1-flash-live-preview",
      telefunTransport: "gemini-live" as const,
    };

    const result = buildTelefunSettingsForSave({
      localSettings: original,
      scenarios: original.scenarios,
      consumerTypes: original.consumerTypes,
      selectedTelefunModel: "gemini-3.1-flash-live-preview",
    });

    expect(result).not.toBe(original);
    expect(result.telefunModelId).toBe("gemini-3.1-flash-live-preview");
    expect(result.telefunTransport).toBe("gemini-live");
    expect(original.telefunTransport).toBe("gemini-live");
  });
});
```

- [ ] **Step 2: Run test and verify it fails for missing exports**

Run:

```bash
pnpm --filter @trainers/web test -- src/__tests__/settings-draft-helpers.test.ts
```

Expected: FAIL with missing export errors for `buildKetikSettingsForSave`, `buildPdktSettingsForSave`, and `buildTelefunSettingsForSave`.

- [ ] **Step 3: Add pure helper exports**

In `apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts`, add before `useKetikSettingsDraft()`:

```ts
export function buildKetikSettingsForSave(params: {
  localSettings: KetikAppSettings;
  scenarios: KetikScenario[];
  consumerTypes: KetikConsumerType[];
  quickTemplates: KetikQuickTemplate[];
}): KetikAppSettings {
  return {
    ...params.localSettings,
    scenarios: params.scenarios,
    consumerTypes: params.consumerTypes,
    quickTemplates: params.quickTemplates,
  };
}
```

In `apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts`, add:

```ts
interface PdktSystemDraft {
  enableImageGeneration: boolean;
  globalConsumerTypeId: string;
  selectedModel: string;
  consumerNameMentionPattern: AppSettings["consumerNameMentionPattern"];
  writingStyleMode: AppSettings["writingStyleMode"];
  customIdentity: NonNullable<AppSettings["customIdentity"]>;
}

export function buildPdktSettingsForSave(params: {
  localSettings: AppSettings;
  scenarios: PdktScenario[];
  consumerTypes: PdktConsumerType[];
  system: PdktSystemDraft;
}): AppSettings {
  return {
    ...params.localSettings,
    scenarios: params.scenarios,
    consumerTypes: params.consumerTypes,
    enableImageGeneration: params.system.enableImageGeneration,
    globalConsumerTypeId: params.system.globalConsumerTypeId,
    selectedModel: params.system.selectedModel,
    consumerNameMentionPattern: params.system.consumerNameMentionPattern,
    writingStyleMode: params.system.writingStyleMode,
    customIdentity: params.system.customIdentity,
  };
}
```

In `apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts`, add:

```ts
export function buildTelefunSettingsForSave(params: {
  localSettings: AppSettings;
  scenarios: Scenario[];
  consumerTypes: ConsumerType[];
  selectedTelefunModel: string;
}): AppSettings {
  const selectedModel = TELEFUN_AUDIO_MODELS.find(
    (model) => model.id === params.selectedTelefunModel,
  );

  return {
    ...params.localSettings,
    scenarios: params.scenarios,
    consumerTypes: params.consumerTypes,
    telefunTransport: selectedModel?.telefunTransport ?? "gemini-live",
    telefunModelId: params.selectedTelefunModel,
  };
}
```

- [ ] **Step 4: Replace state mutation in `handleSave()`**

Use this pattern in all three draft hooks:

```ts
const nextScenarios = scenarioDirty
  ? scenarioForm.save(localSettings.scenarios)
  : localSettings.scenarios;
const nextConsumerTypes = consumerDirty
  ? consumerForm.save(localSettings.consumerTypes)
  : localSettings.consumerTypes;

const settingsToSave = buildPdktSettingsForSave({
  localSettings,
  scenarios: nextScenarios,
  consumerTypes: nextConsumerTypes,
  system: {
    enableImageGeneration,
    globalConsumerTypeId,
    selectedModel,
    consumerNameMentionPattern,
    writingStyleMode,
    customIdentity: {
      senderName: customSenderName,
      bodyName: customBodyName,
      email: customEmail,
      city: customCity,
    },
  },
});
```

For KETIK include `quickTemplates`; for Telefun include `selectedTelefunModel`.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @trainers/web test -- src/__tests__/settings-draft-helpers.test.ts src/__tests__/ketik-settings-modal.test.tsx src/__tests__/pdkt-settings-modal.test.tsx src/__tests__/telefun-settings-model-default.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/__tests__/settings-draft-helpers.test.ts apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts
git commit -m "refactor(settings): make draft commits immutable"
```

### Task 2: Remove Cast-Heavy Duplicate Save Logic In Settings Tabs

**Files:**
- Modify: `apps/web/src/hooks/useCrudForm.ts` or create `apps/web/src/hooks/useCollectionDraft.ts`
- Modify: `apps/web/src/routes/pdkt/components/settings/PdktConsumersTab.tsx`
- Modify: `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx`
- Modify: `apps/web/src/routes/telefun/components/settings/TelefunConsumersTab.tsx`
- Modify: `apps/web/src/routes/telefun/components/settings/TelefunScenariosTab.tsx`

- [ ] **Step 1: Write helper tests for typed collection commit**

Create or extend `apps/web/src/__tests__/settings-draft-helpers.test.ts`:

```ts
import { applyCollectionDraft } from "../hooks/useCollectionDraft";

describe("applyCollectionDraft", () => {
  it("updates the edited item without mutating the original list", () => {
    const original = [{ id: "1", name: "Old" }];
    const result = applyCollectionDraft({
      items: original,
      editingId: "1",
      draft: { name: "New" },
      create: (draft) => ({ id: "2", ...draft }),
    });

    expect(result).toEqual([{ id: "1", name: "New" }]);
    expect(original).toEqual([{ id: "1", name: "Old" }]);
  });

  it("appends a created item when editingId is null", () => {
    const result = applyCollectionDraft({
      items: [{ id: "1", name: "Old" }],
      editingId: null,
      draft: { name: "Created" },
      create: (draft) => ({ id: "2", ...draft }),
    });

    expect(result).toEqual([
      { id: "1", name: "Old" },
      { id: "2", name: "Created" },
    ]);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm --filter @trainers/web test -- src/__tests__/settings-draft-helpers.test.ts
```

Expected: FAIL because `apps/web/src/hooks/useCollectionDraft.ts` does not exist.

- [ ] **Step 3: Create `useCollectionDraft.ts` with a pure helper**

Create `apps/web/src/hooks/useCollectionDraft.ts`:

```ts
export function applyCollectionDraft<TItem extends { id: string }, TDraft>(
  params: {
    items: TItem[];
    editingId: string | null;
    draft: TDraft;
    create: (draft: TDraft) => TItem;
    update?: (item: TItem, draft: TDraft) => TItem;
  },
): TItem[] {
  if (params.editingId) {
    return params.items.map((item) =>
      item.id === params.editingId
        ? params.update?.(item, params.draft) ?? { ...item, ...params.draft }
        : item,
    );
  }

  return [...params.items, params.create(params.draft)];
}
```

- [ ] **Step 4: Replace tab save branches**

In each tab component, replace the `let updatedTypes = prev.consumerTypes` or `let updatedScenarios = prev.scenarios` branch with:

```ts
setLocalSettings((prev) => ({
  ...prev,
  consumerTypes: applyCollectionDraft({
    items: prev.consumerTypes,
    editingId: consumerForm.editingId,
    draft: consumerForm.draft,
    create: (draft) => ({
      id: `c-${Date.now()}`,
      ...draft,
      isCustom: true,
    }),
  }),
}));
```

For Telefun consumers, use:

```ts
create: (draft) => ({
  id: `c-${Date.now()}`,
  ...draft,
  gender: "random",
}),
update: (item, draft) => ({ ...item, ...draft, gender: draft.gender ?? item.gender ?? "random" }),
```

For scenarios, use:

```ts
scenarios: applyCollectionDraft({
  items: prev.scenarios,
  editingId: scenarioForm.editingId,
  draft: updatedDraft,
  create: (draft) => ({
    id: `s-${Date.now()}`,
    ...draft,
    isActive: true,
  }),
}),
```

- [ ] **Step 5: Run lint for touched files through workspace lint**

Run:

```bash
pnpm --filter @trainers/web lint
```

Expected: no `no-useless-assignment`, `prefer-const`, or `react-hooks/immutability` errors from the touched settings files.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useCollectionDraft.ts apps/web/src/__tests__/settings-draft-helpers.test.ts apps/web/src/routes/pdkt/components/settings/PdktConsumersTab.tsx apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx apps/web/src/routes/telefun/components/settings/TelefunConsumersTab.tsx apps/web/src/routes/telefun/components/settings/TelefunScenariosTab.tsx
git commit -m "refactor(settings): simplify collection draft saves"
```

### Task 3: Centralize SIDAK Input Rule Model

**Files:**
- Create: `apps/web/src/routes/sidak/hooks/useSidakInputRuleModel.ts`
- Create: `apps/web/src/__tests__/sidak-input-rule-model.test.ts`
- Modify: `apps/web/src/routes/sidak/input.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/__tests__/sidak-input-rule-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSidakInputRuleModel } from "../routes/sidak/hooks/useSidakInputRuleModel";

describe("buildSidakInputRuleModel", () => {
  it("uses global indicators when no rule version indicators are loaded", () => {
    const globalIndicators = [
      { id: "i1", service_type: "call", name: "Salam", category: "none", bobot: 1, has_na: false },
    ];

    const result = buildSidakInputRuleModel({
      ruleIndicatorsRaw: [],
      globalIndicators,
      selectedService: "call",
    });

    expect(result.activeIndicators).toEqual(globalIndicators);
    expect([...result.unlinkedIndicatorIds]).toEqual([]);
  });

  it("maps rule indicators and tracks unlinked ids exactly once", () => {
    const result = buildSidakInputRuleModel({
      selectedService: "email",
      globalIndicators: [],
      ruleIndicatorsRaw: [
        {
          ruleIndicatorId: "r1",
          legacyIndicatorId: "i1",
          name: "Parameter Linked",
          category: "critical",
          bobot: 2,
          has_na: false,
        },
        {
          ruleIndicatorId: "r2",
          legacyIndicatorId: undefined,
          name: "Parameter Belum Link",
          category: "none",
          bobot: 1,
          has_na: true,
        },
      ],
    });

    expect(result.activeIndicators.map((item) => item.id)).toEqual(["i1", "r2"]);
    expect(result.activeIndicators[0].service_type).toBe("email");
    expect([...result.unlinkedIndicatorIds]).toEqual(["r2"]);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm --filter @trainers/web test -- src/__tests__/sidak-input-rule-model.test.ts
```

Expected: FAIL because `useSidakInputRuleModel.ts` does not exist.

- [ ] **Step 3: Create rule model helper and hook**

Create `apps/web/src/routes/sidak/hooks/useSidakInputRuleModel.ts`:

```ts
import { useMemo } from "react";
import type { QAIndicator } from "@trainers/types";

export interface SidakRuleIndicatorRow {
  ruleIndicatorId: string;
  legacyIndicatorId?: string;
  name: string;
  category: QAIndicator["category"];
  bobot: number;
  has_na: boolean;
}

export interface SidakInputRuleModel {
  activeIndicators: QAIndicator[];
  unlinkedIndicatorIds: Set<string>;
}

export function buildSidakInputRuleModel(params: {
  ruleIndicatorsRaw: SidakRuleIndicatorRow[];
  globalIndicators: QAIndicator[];
  selectedService: string;
}): SidakInputRuleModel {
  if (params.ruleIndicatorsRaw.length === 0) {
    return {
      activeIndicators: params.globalIndicators,
      unlinkedIndicatorIds: new Set<string>(),
    };
  }

  const activeIndicators: QAIndicator[] = params.ruleIndicatorsRaw.map((ri) => ({
    id: ri.legacyIndicatorId || ri.ruleIndicatorId,
    service_type: params.selectedService,
    name: ri.name,
    category: ri.category,
    bobot: ri.bobot,
    has_na: ri.has_na,
    ruleIndicatorId: ri.ruleIndicatorId,
    legacyIndicatorId: ri.legacyIndicatorId,
  }));

  const unlinkedIndicatorIds = new Set(
    params.ruleIndicatorsRaw
      .filter((ri) => !ri.legacyIndicatorId)
      .map((ri) => ri.ruleIndicatorId),
  );

  return { activeIndicators, unlinkedIndicatorIds };
}

export function useSidakInputRuleModel(params: {
  ruleIndicatorsRaw: SidakRuleIndicatorRow[];
  globalIndicators: QAIndicator[];
  selectedService: string;
}): SidakInputRuleModel {
  return useMemo(
    () => buildSidakInputRuleModel(params),
    [params.ruleIndicatorsRaw, params.globalIndicators, params.selectedService],
  );
}
```

- [ ] **Step 4: Replace duplicated memos in `input.tsx`**

In `apps/web/src/routes/sidak/input.tsx`:

```ts
import {
  useSidakInputRuleModel,
  type SidakRuleIndicatorRow,
} from "./hooks/useSidakInputRuleModel";
```

Change:

```ts
const [ruleIndicatorsRaw, setRuleIndicatorsRaw] = useState<any[]>([]);
```

to:

```ts
const [ruleIndicatorsRaw, setRuleIndicatorsRaw] = useState<SidakRuleIndicatorRow[]>([]);
```

Then define once:

```ts
const { activeIndicators, unlinkedIndicatorIds } = useSidakInputRuleModel({
  ruleIndicatorsRaw,
  globalIndicators: indicators ?? [],
  selectedService,
});
```

Pass `activeIndicators` and `unlinkedIndicatorIds` to `useTemuanForm()` and `useTemuanImport()` instead of inline `useMemo()` blocks.

- [ ] **Step 5: Run targeted SIDAK input tests**

Run:

```bash
pnpm --filter @trainers/web test -- src/__tests__/sidak-input-rule-model.test.ts src/__tests__/sidak-input-legacy-refresh.test.tsx src/__tests__/sidak-input-parity.test.tsx src/__tests__/sidak-input-agents-shape.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/sidak/hooks/useSidakInputRuleModel.ts apps/web/src/__tests__/sidak-input-rule-model.test.ts apps/web/src/routes/sidak/input.tsx
git commit -m "refactor(sidak): centralize input rule model"
```

### Task 4: Mechanical Quality Gate Cleanup

**Files:**
- Modify: all files reported by `git diff --check origin/main..HEAD`
- Modify: settings files reported by `pnpm --filter @trainers/web lint`

- [ ] **Step 1: Run whitespace check**

Run:

```bash
git diff --check origin/main..HEAD
```

Expected before cleanup: trailing whitespace lines in `apps/api/src/services/ketik/review-processor.ts`, `KetikScenariosTab.tsx`, and Telefun settings files.

- [ ] **Step 2: Remove trailing whitespace only**

Use a patch or formatter scoped to touched files. Do not reformat unrelated files. After cleanup, run:

```bash
git diff --check origin/main..HEAD
```

Expected: no output and exit code 0.

- [ ] **Step 3: Run web lint and inspect remaining errors**

Run:

```bash
pnpm --filter @trainers/web lint
```

Expected: 0 errors. Warnings are allowed only if they predate this cleanup or are outside touched files.

- [ ] **Step 4: Run root lint**

Run:

```bash
pnpm lint
```

Expected: 0 errors. Warnings are allowed by repo convention.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/ketik/review-processor.ts apps/web/src/routes/ketik/components/settings/KetikScenariosTab.tsx apps/web/src/routes/telefun/components/SettingsModal.tsx apps/web/src/routes/telefun/components/settings/TelefunConsumersTab.tsx apps/web/src/routes/telefun/components/settings/TelefunIdentityTab.tsx apps/web/src/routes/telefun/components/settings/TelefunScenariosTab.tsx apps/web/src/routes/telefun/components/settings/TelefunSystemTab.tsx apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts
git commit -m "chore: clear decomposition quality gates"
```

### Task 5: Refresh Graph Evidence And Docs

**Files:**
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`
- Modify: `graphify-out/graph.html`
- Modify: `graphify-out/.graphify_labels.json`
- Create: `docs/rebuild-logs/phase-85-thermo-quality-gate-hardening.md`

- [ ] **Step 1: Refresh graph**

Run:

```bash
graphify update .
```

Expected: `graphify-out/GRAPH_REPORT.md` built commit equals current `git rev-parse HEAD`.

- [ ] **Step 2: Verify graph freshness**

Run:

```bash
git rev-parse HEAD
rg -n "Built from commit" graphify-out/GRAPH_REPORT.md
```

Expected: both commits match exactly.

- [ ] **Step 3: Create rebuild log**

Create `docs/rebuild-logs/phase-85-thermo-quality-gate-hardening.md`:

```md
# Phase 85 - Thermo Quality Gate Hardening

## Summary

Phase 85 fixes the maintainability blockers found after the phase 78-84 decomposition branch:

- settings draft saves now build new immutable settings objects instead of mutating state snapshots;
- repeated settings tab save branches now use one typed collection-draft helper;
- SIDAK input rule indicator derivation now has one source of truth;
- whitespace and lint blockers from the decomposition branch were cleared;
- Graphify evidence was refreshed after the cleanup.

## Verification

Commands run:

```bash
git diff --check origin/main..HEAD
pnpm --filter @trainers/web test -- src/__tests__/settings-draft-helpers.test.ts src/__tests__/sidak-input-rule-model.test.ts src/__tests__/ketik-settings-modal.test.tsx src/__tests__/pdkt-settings-modal.test.tsx src/__tests__/telefun-settings-model-default.test.ts src/__tests__/sidak-input-legacy-refresh.test.tsx src/__tests__/sidak-input-parity.test.tsx src/__tests__/sidak-input-agents-shape.test.ts
node node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc -p apps/web/tsconfig.app.json --noEmit --pretty false
pnpm lint
pnpm build
pnpm test
```

## Notes

This phase is behavior-preserving. It does not change Supabase schema, API contracts, scoring formulas, or visible UI.
```

- [ ] **Step 4: Commit**

```bash
git add graphify-out docs/rebuild-logs/phase-85-thermo-quality-gate-hardening.md
git commit -m "docs: record phase 85 quality gate hardening"
```

### Task 6: Final Verification

**Files:**
- Modify: none unless verification reveals a blocker

- [ ] **Step 1: Run direct web compile**

Run:

```bash
node node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc -p apps/web/tsconfig.app.json --noEmit --pretty false
```

Expected: no TypeScript errors.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
pnpm --filter @trainers/web test -- src/__tests__/settings-draft-helpers.test.ts src/__tests__/sidak-input-rule-model.test.ts src/__tests__/ketik-settings-modal.test.tsx src/__tests__/pdkt-settings-modal.test.tsx src/__tests__/telefun-settings-model-default.test.ts src/__tests__/sidak-input-legacy-refresh.test.tsx src/__tests__/sidak-input-parity.test.tsx src/__tests__/sidak-input-agents-shape.test.ts
```

Expected: all listed test files pass.

- [ ] **Step 3: Run full quality gate**

Run:

```bash
git diff --check origin/main..HEAD
pnpm lint
pnpm build
pnpm test
```

Expected: all commands pass. `pnpm lint` may print warnings, but must have 0 errors.

- [ ] **Step 4: Self-review against thermo-nuclear bar**

Run:

```bash
find apps packages -type f \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' -not -path '*/dist/*' -print0 | xargs -0 wc -l | sort -nr | head -30
rg -n "as any|let finalSettings = localSettings|JSON.stringify\\(draft\\)|updatedTypes = prev|updatedScenarios = prev" apps/web/src/hooks apps/web/src/routes/ketik/components/settings apps/web/src/routes/pdkt/components/settings apps/web/src/routes/telefun/components/settings apps/web/src/routes/sidak
```

Expected:

- no new file crosses 1000 lines;
- no `let finalSettings = localSettings`;
- no `updatedTypes = prev.consumerTypes`;
- no `updatedScenarios = prev.scenarios`;
- any remaining `as any` is either pre-existing outside touched paths or has a typed follow-up finding.

- [ ] **Step 5: Commit final fixes if any**

If Step 4 required cleanup:

```bash
git add apps/web/src/hooks apps/web/src/routes/ketik/components/settings apps/web/src/routes/pdkt/components/settings apps/web/src/routes/telefun/components/settings apps/web/src/routes/sidak docs/rebuild-logs/phase-85-thermo-quality-gate-hardening.md
git commit -m "refactor: finish phase 85 maintainability cleanup"
```

If Step 4 found no changes, do not create an empty commit.

---

## 4. Self-Review Checklist

| Check | Result |
|---|---|
| Requirement coverage | AC-1 through AC-8 map to Tasks 1-6. |
| Placeholder scan | No `TBD`, no open-ended "handle later", no unspecified test step. |
| Type consistency | `AppSettings`, `KetikAppSettings`, `Scenario`, `ConsumerType`, `QAIndicator`, and `SidakRuleIndicatorRow` are defined or imported in the task where used. |
| Thermo-nuclear bar | Plan deletes duplicate branches and state mutation instead of spreading the same complexity. |
| Repo convention | Plan is saved under `plan/markdown/` and includes Requirement, Design, and Tasklist sections. |

