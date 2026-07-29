import { useState, useCallback, useRef } from "react";

export interface UseCrudFormOptions<T> {
  generateId: () => string;
  defaultValues: Omit<T, "id">;
  validate: (draft: Omit<T, "id">) => boolean;
  createItem: (id: string, draft: Omit<T, "id">) => T;
  updateItem?: (item: T, draft: Omit<T, "id">) => T;
  isEqual?: (left: Omit<T, "id">, right: Omit<T, "id">) => boolean;
}

export function useCrudForm<T extends { id: string }>({
  generateId,
  defaultValues,
  validate,
  createItem,
  updateItem,
  isEqual = shallowEqualDraft,
}: UseCrudFormOptions<T>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraftState] = useState<Omit<T, "id">>(() => ({
    ...defaultValues,
  }));
  const draftGenerationRef = useRef(0);

  type DraftPatch =
    | Partial<Omit<T, "id">>
    | ((previous: Omit<T, "id">) => Partial<Omit<T, "id">>);

  const setDraft = useCallback((patch: DraftPatch) => {
    setDraftState((prev) => ({
      ...prev,
      ...(typeof patch === "function" ? patch(prev) : patch),
    }));
  }, []);

  const advanceDraftGeneration = useCallback(() => {
    draftGenerationRef.current += 1;
  }, []);

  const getDraftGeneration = useCallback(() => draftGenerationRef.current, []);

  const openAdd = useCallback(() => {
    advanceDraftGeneration();
    setEditingId(null);
    setIsOpen(true);
    setDraftState({ ...defaultValues });
  }, [defaultValues, advanceDraftGeneration]);

  const openEdit = useCallback(
    (item: T) => {
      advanceDraftGeneration();
      setEditingId(item.id);
      setIsOpen(true);
      const { id: _, ...rest } = item;
      setDraftState(rest);
    },
    [advanceDraftGeneration],
  );

  const close = useCallback(() => {
    advanceDraftGeneration();
    setEditingId(null);
    setIsOpen(false);
    setDraftState({ ...defaultValues });
  }, [defaultValues, advanceDraftGeneration]);

  const save = useCallback(
    (items: T[], draftOverride?: Omit<T, "id">): T[] => {
      const nextDraft = draftOverride ?? draft;
      if (!validate(nextDraft)) return items;
      if (editingId) {
        return items.map((item) =>
          item.id === editingId
            ? (updateItem?.(item, nextDraft) ?? { ...item, ...nextDraft })
            : item,
        );
      } else {
        return [...items, createItem(generateId(), nextDraft)];
      }
    },
    [editingId, draft, generateId, validate, createItem, updateItem],
  );

  const remove = useCallback((id: string, items: T[]): T[] => {
    return items.filter((item) => item.id !== id);
  }, []);

  const isDirty = useCallback(
    (items: T[]): boolean => {
      if (!isOpen) return false;
      if (editingId) {
        const original = items.find((item) => item.id === editingId);
        if (!original) return true;
        const { id: _, ...rest } = original;
        return !isEqual(draft, rest);
      }
      return !isEqual(draft, defaultValues);
    },
    [isOpen, editingId, draft, defaultValues, isEqual],
  );

  const isValid = useCallback(
    (draftOverride?: Omit<T, "id">) => {
      return validate(draftOverride ?? draft);
    },
    [draft, validate],
  );

  return {
    editingId,
    setEditingId,
    isOpen,
    setIsOpen,
    draft,
    setDraft,
    getDraftGeneration,
    openAdd,
    openEdit,
    close,
    save,
    remove,
    isDirty,
    isValid,
  };
}

function shallowEqualDraft<T extends object>(left: T, right: T): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) =>
    Object.is(Reflect.get(left, key), Reflect.get(right, key)),
  );
}
