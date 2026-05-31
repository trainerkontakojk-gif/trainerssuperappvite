import { useState, useCallback } from "react";

export interface UseCrudFormOptions<T> {
  generateId: () => string;
  defaultValues: Omit<T, "id">;
  validate: (draft: Omit<T, "id">) => boolean;
}

export function useCrudForm<T extends { id: string }>({
  generateId,
  defaultValues,
  validate,
}: UseCrudFormOptions<T>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraftState] = useState<Omit<T, "id">>(() => ({ ...defaultValues }));

  const setDraft = useCallback((patch: Partial<Omit<T, "id">>) => {
    setDraftState((prev) => ({ ...prev, ...patch }));
  }, []);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setIsOpen(true);
    setDraftState({ ...defaultValues });
  }, [defaultValues]);

  const openEdit = useCallback((item: T) => {
    setEditingId(item.id);
    setIsOpen(true);
    const { id: _, ...rest } = item;
    // rest is Omit<T, "id"> which is assignable to the state type without as any
    setDraftState(rest);
  }, []);

  const close = useCallback(() => {
    setEditingId(null);
    setIsOpen(false);
    setDraftState({ ...defaultValues });
  }, [defaultValues]);

  const save = useCallback((items: T[]): T[] => {
    if (!validate(draft)) return items;
    if (editingId) {
      return items.map((item) =>
        // Cast 'as T' is necessary because spreading generic T and Omit<T, "id">
        // is not automatically assignable to type parameter T in TypeScript.
        item.id === editingId ? ({ ...item, ...draft } as T) : item
      );
    } else {
      // Cast 'as T' is necessary because generic T cannot be instantiated with a concrete object type.
      const newItem = { id: generateId(), ...draft } as T;
      return [...items, newItem];
    }
  }, [editingId, draft, generateId, validate]);

  const remove = useCallback((id: string, items: T[]): T[] => {
    return items.filter((item) => item.id !== id);
  }, []);

  const isDirty = useCallback((items: T[]): boolean => {
    if (!isOpen) return false;
    if (editingId) {
      const original = items.find((item) => item.id === editingId);
      if (!original) return true;
      const { id: _, ...rest } = original;
      // Flat object key-order comparison via JSON.stringify is safe and non-brittle here
      // because both objects have the exact same shape/keys of type Omit<T, "id">.
      return JSON.stringify(draft) !== JSON.stringify(rest);
    }
    return JSON.stringify(draft) !== JSON.stringify(defaultValues);
  }, [isOpen, editingId, draft, defaultValues]);

  const isValid = useCallback(() => {
    return validate(draft);
  }, [draft, validate]);

  return {
    editingId,
    setEditingId,
    isOpen,
    setIsOpen,
    draft,
    setDraft,
    openAdd,
    openEdit,
    close,
    save,
    remove,
    isDirty,
    isValid,
  };
}
