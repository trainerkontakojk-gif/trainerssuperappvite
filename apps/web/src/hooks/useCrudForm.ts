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
    const { id, ...rest } = item;
    setDraftState(rest as any);
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
        item.id === editingId ? ({ ...item, ...draft } as T) : item
      );
    } else {
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
      const { id, ...rest } = original;
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
