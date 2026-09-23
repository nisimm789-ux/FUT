import { CONTRACTS_VERSION, PositionSchema } from '@fc/contracts';
import type { ClubItem, ClubSnapshot, ItemLocation, Rarity } from '@fc/contracts';
import type { ClubSelectors } from '../profiles/types.js';
import { idFromAsset, parseIntStrict, requireAttr, requireElement } from './parse.js';
import { ReadFailure, type ClubReader } from './types.js';

const LOCATIONS: Record<string, ItemLocation> = {
  club: 'CLUB',
  'sbc-storage': 'SBC_STORAGE',
  unassigned: 'UNASSIGNED',
  'transfer-list': 'TRANSFER_LIST',
};

/**
 * Reads the item lists currently rendered in the club view. The EA Web App
 * paginates, so unless every list is flagged complete the snapshot is
 * `partial` and must not be treated as the whole club.
 */
export function createClubReader(selectors: ClubSelectors): ClubReader {
  return {
    capability: 'clubReading',
    supported: true,
    read(doc, ctx) {
      const lists = [...doc.querySelectorAll(selectors.list)];
      if (lists.length === 0) throw new ReadFailure('STRUCTURE_NOT_FOUND', 'no item lists found');

      let complete = true;
      const items: ClubItem[] = [];
      for (const list of lists) {
        const location = LOCATIONS[requireAttr(list, selectors.attrs.listLocation, 'list location')];
        if (!location) throw new ReadFailure('VALUE_OUT_OF_RANGE', 'unknown list location');
        if (list.getAttribute(selectors.attrs.listComplete) !== 'true') complete = false;
        for (const el of list.querySelectorAll(selectors.item)) items.push(readItem(el, location, selectors));
      }

      const snapshot: ClubSnapshot = {
        schemaVersion: CONTRACTS_VERSION,
        coverage: complete ? 'complete' : 'partial',
        items,
        provenance: ctx.provenance,
        observedAt: ctx.now,
      };
      return { ok: true, value: snapshot };
    },
  };
}

function readItem(el: Element, location: ItemLocation, s: ClubSelectors): ClubItem {
  const tile = el.firstElementChild ?? el;
  const position = PositionSchema.safeParse(requireElement(el, s.position, 'position').getAttribute(s.attrs.position));
  if (!position.success) throw new ReadFailure('VALUE_OUT_OF_RANGE', 'unknown position');
  const priceEl = el.querySelector(s.price);

  return {
    id: requireAttr(el, s.attrs.itemId, 'item id'),
    definitionId: idFromAsset(el.querySelector<HTMLImageElement>(s.portrait), s.assetIdPatterns.definition, 'definition'),
    name: (el.querySelector(s.name)?.textContent ?? '').trim().slice(0, 80) || 'Unknown',
    rating: parseIntStrict(requireElement(el, s.rating, 'rating').textContent, 'rating', 1, 99),
    rarity: rarityOf(tile, s),
    positions: [position.data],
    nationId: idFromAsset(el.querySelector<HTMLImageElement>(s.nation), s.assetIdPatterns.nation, 'nation'),
    leagueId: idFromAsset(el.querySelector<HTMLImageElement>(s.league), s.assetIdPatterns.league, 'league'),
    clubId: idFromAsset(el.querySelector<HTMLImageElement>(s.club), s.assetIdPatterns.club, 'club'),
    tradeable: !tile.classList.contains(s.untradeableClass),
    location,
    estimatedPrice: priceEl ? parseIntStrict(priceEl.getAttribute(s.attrs.coins), 'price', 0, 999_999_999) : null,
  };
}

function rarityOf(tile: Element, s: ClubSelectors): Rarity {
  const found = (Object.keys(s.rarityClasses) as Rarity[]).filter((r) => tile.classList.contains(s.rarityClasses[r]));
  if (found.length !== 1 || !found[0]) throw new ReadFailure('VALUE_OUT_OF_RANGE', 'ambiguous rarity');
  return found[0];
}
