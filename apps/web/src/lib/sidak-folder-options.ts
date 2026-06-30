export interface SidakFolderOption {
  id: string;
  name?: string;
  nama?: string;
  parent_id?: string | null;
}

export interface NormalizedSidakFolderOption {
  id: string;
  name: string;
  nama: string;
  parent_id: string | null;
}

export interface SidakFolderSelectGroup {
  parent: NormalizedSidakFolderOption;
  children: NormalizedSidakFolderOption[];
}

const folderCollator = new Intl.Collator("id", {
  sensitivity: "base",
  numeric: true,
});

function sortFolders<T extends { name: string }>(folders: T[]): T[] {
  return [...folders].sort((left, right) =>
    folderCollator.compare(left.name, right.name),
  );
}

export function normalizeSidakFolderOptions(
  folders: SidakFolderOption[] = [],
): NormalizedSidakFolderOption[] {
  const deduped = new Map<string, NormalizedSidakFolderOption>();

  for (const folder of folders) {
    const id = folder.id?.trim() ?? "";
    const name = (folder.name ?? folder.nama ?? "").trim();
    if (!id || !name) continue;

    deduped.set(id, {
      id,
      name,
      nama: name,
      parent_id: folder.parent_id ?? null,
    });
  }

  return sortFolders(Array.from(deduped.values()));
}

export function buildSidakFolderSelectGroups(
  folders: SidakFolderOption[] = [],
): {
  groupedFolders: SidakFolderSelectGroup[];
  standaloneFolders: NormalizedSidakFolderOption[];
} {
  const normalizedFolders = normalizeSidakFolderOptions(folders);
  const folderIds = new Set(normalizedFolders.map((folder) => folder.id));
  const childrenByParent = new Map<string, NormalizedSidakFolderOption[]>();

  for (const folder of normalizedFolders) {
    if (!folder.parent_id || !folderIds.has(folder.parent_id)) continue;
    const currentChildren = childrenByParent.get(folder.parent_id) ?? [];
    currentChildren.push(folder);
    childrenByParent.set(folder.parent_id, currentChildren);
  }

  const groupedFolders: SidakFolderSelectGroup[] = [];
  const standaloneFolders: NormalizedSidakFolderOption[] = [];

  for (const folder of normalizedFolders) {
    if (folder.parent_id && folderIds.has(folder.parent_id)) {
      continue;
    }

    const children = sortFolders(childrenByParent.get(folder.id) ?? []);
    if (children.length > 0) {
      groupedFolders.push({ parent: folder, children });
      continue;
    }

    standaloneFolders.push(folder);
  }

  const orphanChildren = normalizedFolders.filter(
    (folder) => folder.parent_id && !folderIds.has(folder.parent_id),
  );

  return {
    groupedFolders: [...groupedFolders]
      .sort((left, right) =>
        folderCollator.compare(left.parent.name, right.parent.name),
      )
      .map((group) => ({
        ...group,
        children: sortFolders(group.children),
      })),
    standaloneFolders: sortFolders([...standaloneFolders, ...orphanChildren]),
  };
}

export function findPrimarySidakFolderByName(
  folders: SidakFolderOption[] = [],
  folderName?: string | null,
): NormalizedSidakFolderOption | null {
  if (!folderName) return null;

  const target = folderName.trim().toLowerCase();
  const normalizedFolders = normalizeSidakFolderOptions(folders);

  return (
    normalizedFolders.find(
      (folder) =>
        folder.parent_id === null && folder.name.trim().toLowerCase() === target,
    ) ??
    normalizedFolders.find(
      (folder) => folder.name.trim().toLowerCase() === target,
    ) ??
    null
  );
}
