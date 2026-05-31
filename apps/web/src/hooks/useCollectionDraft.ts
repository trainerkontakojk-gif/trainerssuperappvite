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
        // Type assertion 'as T' is necessary because spreading generic T and partial types
        // is not statically guaranteed to satisfy T in TypeScript without casting.
        ? ({ ...item, ...params.draft } as T)
        : item
    );
  } else {
    // Type assertion 'as T' is necessary because constructing an object with generic T
    // requires casting since the compiler cannot verify the concrete type properties.
    const newItem = {
      id: `${params.idPrefix}-${Date.now()}`,
      ...params.draft,
      ...params.extraDefaults,
    } as T;
    return [...params.items, newItem];
  }
}
