import type { ClubItem } from '@fc/contracts';

export interface DuplicateGroup {
  definitionId: number;
  itemIds: string[];
}

/** Groups of owned items that share a catalog definition (sorted for determinism). */
export function findDuplicateGroups(items: readonly ClubItem[]): DuplicateGroup[] {
  const byDefinition = new Map<number, string[]>();
  for (const item of items) {
    const ids = byDefinition.get(item.definitionId) ?? [];
    ids.push(item.id);
    byDefinition.set(item.definitionId, ids);
  }
  return [...byDefinition.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([definitionId, ids]) => ({ definitionId, itemIds: ids.sort() }))
    .sort((a, b) => a.definitionId - b.definitionId);
}

/**
 * Items that are "spare": anything in SBC storage, plus every copy of a
 * duplicated definition except the one kept in the club.
 */
export function spareItemIds(items: readonly ClubItem[]): Set<string> {
  const spare = new Set<string>();
  for (const item of items) {
    if (item.location === 'SBC_STORAGE') spare.add(item.id);
  }
  for (const group of findDuplicateGroups(items)) {
    const groupItems = items.filter((i) => i.definitionId === group.definitionId);
    const keeper = groupItems.find((i) => i.location === 'CLUB') ?? groupItems[0];
    for (const i of groupItems) if (i !== keeper) spare.add(i.id);
  }
  return spare;
}
