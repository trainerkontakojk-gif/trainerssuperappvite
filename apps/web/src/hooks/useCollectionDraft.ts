export function applyCollectionDraft<T extends { id: string }>(params: {
  items: T[];
  draft: Partial<Omit<T, "id">>;
  editingId: string | null;
  idPrefix: string;
  extraDefaults?: Partial<T>;
}): T[] {
  if (params.editingId) {
    return params.items.map((item) =>
      item.id === params.editingId
        ? ({ ...item, ...params.draft } as T)
        : item
    );
  } else {
    const newItem = {
      id: `${params.idPrefix}-${Date.now()}`,
      ...params.draft,
      ...params.extraDefaults,
    } as T;
    return [...params.items, newItem];
  }
}
