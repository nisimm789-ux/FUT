import { maskNumbers, normalizeText } from '../interpretation/normalize.js';
import type { RequirementEvidence } from '../interpretation/types.js';
import { fnv1a } from '../hash.js';
import type { SbcProfile } from '../profiles/types.js';

/** Elements whose content is never read (user input and executable/embedded content). */
const SKIP = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME']);

export interface RequirementRow {
  el: Element;
  text: string;
  completed: boolean | null;
  assets: { kind: 'nation' | 'league' | 'club'; id: number; src: string }[];
  evidence: RequirementEvidence;
  /** Stable shape hash with numbers masked. */
  structuralFingerprint: string;
}

/** Visible text of an element, skipping inputs and editable content. */
export function safeTextOf(el: Element): string {
  let out = '';
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out += `${child.textContent ?? ''} `;
      else if (child.nodeType === 1) {
        const e = child as Element;
        if (SKIP.has(e.tagName) || e.hasAttribute('contenteditable')) continue;
        walk(e);
      }
    }
  };
  walk(el);
  return out.replace(/\s+/g, ' ').trim();
}

export function extractRequirementRows(root: Element, profile: SbcProfile): RequirementRow[] {
  return [...root.querySelectorAll(profile.requirementRow)].map((el) => {
    const text = safeTextOf(el);
    const assets: RequirementRow['assets'] = [];
    for (const img of el.querySelectorAll('img')) {
      const src = img.getAttribute('src') ?? '';
      for (const kind of ['nation', 'league', 'club'] as const) {
        const match = profile.assetIdPatterns[kind].exec(src);
        if (match?.[1]) assets.push({ kind, id: Number(match[1]), src });
      }
    }
    const ids = (kind: 'nation' | 'league' | 'club') => [...new Set(assets.filter((a) => a.kind === kind).map((a) => a.id))];
    const completed = profile.completedClasses.length === 0 ? null : profile.completedClasses.some((c) => el.classList.contains(c));
    const normalized = normalizeText(text);
    return {
      el,
      text,
      completed,
      assets,
      evidence: { text, assetIds: { nation: ids('nation'), league: ids('league'), club: ids('club') } },
      structuralFingerprint: fnv1a(`${maskNumbers(normalized)}|${assets.map((a) => a.kind).sort().join(',')}`),
    };
  });
}

export interface SlotSummary {
  total: number;
  active: number;
  /** null = the profile has no verified occupancy signature (unknown, not zero). */
  filled: number | null;
  locked: number;
}

export function readSlots(doc: Document, profile: SbcProfile): SlotSummary | null {
  if (!profile.pitchRoot || !profile.slots) return null;
  const pitch = doc.querySelector(profile.pitchRoot);
  if (!pitch) return null;
  const { slot, filled, locked } = profile.slots;
  const matchesOrContains = (el: Element, selector: string) => el.matches(selector) || el.querySelector(selector) !== null;
  let lockedCount = 0;
  let filledCount = 0;
  const slots = [...pitch.querySelectorAll(slot)];
  for (const el of slots) {
    if (locked && matchesOrContains(el, locked)) lockedCount += 1;
    else if (filled && matchesOrContains(el, filled)) filledCount += 1;
  }
  return { total: slots.length, active: slots.length - lockedCount, filled: filled ? filledCount : null, locked: lockedCount };
}

/** Cheap fingerprint of everything the SBC reader depends on. */
export function sbcFingerprint(doc: Document, profile: SbcProfile): string | null {
  const root = doc.querySelector(profile.requirementsRoot);
  if (!root) return null;
  const rows = extractRequirementRows(root, profile).map((r) => `${normalizeText(r.text)}|${r.completed}|${r.assets.map((a) => a.src).join(',')}`);
  // Occupancy participates only when the profile has a filled signature; an
  // unknown (null) occupancy can therefore never cause a false state change.
  const slots = readSlots(doc, profile);
  const name = profile.name ? (doc.querySelector(profile.name)?.textContent ?? '').trim() : '';
  const attrs = profile.structural
    ? [profile.structural.challengeIdAttr, profile.structural.squadSizeAttr].map((a) => root.getAttribute(a) ?? '').join('|')
    : '';
  return fnv1a(JSON.stringify({ rows, slots, name, attrs }));
}
