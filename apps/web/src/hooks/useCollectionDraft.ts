export function applyCollectionDraft<T extends { id: string }>(params: {
  items: T[];
  draft: Partial<Omit<T, "id">>;
  editingId: string | null;
  create: (draft: Partial<Omit<T, "id">>) => T;
  update?: (item: T, draft: Partial<Omit<T, "id">>) => T;
}): T[] {
  if (params.editingId) {
    return params.items.map((item) =>
      item.id === params.editingId
        ? (params.update?.(item, params.draft) ?? { ...item, ...params.draft })
        : item
    );
  } else {
    return [...params.items, params.create(params.draft)];
  }
}
