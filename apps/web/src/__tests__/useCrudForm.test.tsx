import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCrudForm } from "../hooks/useCrudForm";

interface ScenarioItem {
  id: string;
  category: string;
  title: string;
  script: string;
  isActive: boolean;
}

const defaultValues: Omit<ScenarioItem, "id"> = {
  category: "",
  title: "",
  script: "",
  isActive: true,
};

function renderScenarioForm() {
  const generateId = vi.fn(() => "s-new");
  const createItem = vi.fn((id: string, draft: Omit<ScenarioItem, "id">) => ({
    id,
    ...draft,
  }));

  const hook = renderHook(() =>
    useCrudForm<ScenarioItem>({
      generateId,
      defaultValues,
      validate: (draft) => Boolean(draft.category && draft.title),
      createItem,
    }),
  );

  return { ...hook, generateId, createItem };
}

describe("useCrudForm", () => {
  it("accepts a functional draft patch for async updates", () => {
    const { result } = renderScenarioForm();

    act(() => {
      result.current.openAdd();
      result.current.setDraft((previous) => ({
        title: `${previous.title}async`,
      }));
    });

    expect(result.current.draft.title).toBe("async");
  });

  it("creates a new item from a normalized draft override", () => {
    const { result, generateId, createItem } = renderScenarioForm();
    const items: ScenarioItem[] = [];

    let nextItems: ScenarioItem[] = [];
    act(() => {
      result.current.openAdd();
      result.current.setDraft({
        category: "Billing",
        title: "Dispute",
        script: "stale script",
      });
    });
    act(() => {
      nextItems = result.current.save(items, {
        category: "Billing",
        title: "Dispute",
        script: "",
        isActive: true,
      });
    });

    expect(generateId).toHaveBeenCalledTimes(1);
    expect(createItem).toHaveBeenCalledWith("s-new", {
      category: "Billing",
      title: "Dispute",
      script: "",
      isActive: true,
    });
    expect(nextItems).toEqual([
      {
        id: "s-new",
        category: "Billing",
        title: "Dispute",
        script: "",
        isActive: true,
      },
    ]);
  });

  it("updates an existing item from a normalized draft override", () => {
    const { result } = renderScenarioForm();
    const items: ScenarioItem[] = [
      {
        id: "s-1",
        category: "Old",
        title: "Old title",
        script: "old script",
        isActive: false,
      },
    ];

    let nextItems: ScenarioItem[] = [];
    act(() => {
      result.current.openEdit(items[0]);
    });
    act(() => {
      nextItems = result.current.save(items, {
        category: "New",
        title: "New title",
        script: "",
        isActive: false,
      });
    });

    expect(nextItems).toEqual([
      {
        id: "s-1",
        category: "New",
        title: "New title",
        script: "",
        isActive: false,
      },
    ]);
    expect(items[0].title).toBe("Old title");
  });

  it("validates draft overrides before saving", () => {
    const { result } = renderScenarioForm();
    const items: ScenarioItem[] = [];

    let nextItems: ScenarioItem[] = [
      {
        id: "unexpected",
        category: "Unexpected",
        title: "Unexpected",
        script: "",
        isActive: true,
      },
    ];
    act(() => {
      result.current.openAdd();
    });
    act(() => {
      nextItems = result.current.save(items, {
        category: "",
        title: "Missing category",
        script: "",
        isActive: true,
      });
    });

    expect(
      result.current.isValid({
        category: "",
        title: "Missing category",
        script: "",
        isActive: true,
      }),
    ).toBe(false);
    expect(nextItems).toBe(items);
  });
});
