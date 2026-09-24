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

export type SlotOccupancy = 'EMPTY' | 'FILLED' | 'UNKNOWN' | 'LOCKED';

export interface SlotSummary {
  total: number;
  active: number;
  /**
   * Number of filled active slots, or null when occupancy of ANY active slot is
   * unknown (or the profile has no occupancy signature). Never a partial count.
   */
  filled: number | null;
  locked: number;
  /** Per-slot state in DOM order. */
  states: SlotOccupancy[];
  warnings: string[];
}

type SlotsProfile = NonNullable<SbcProfile['slots']>;

const matchesOrContains = (el: Element, selector: string) => el.matches(selector) || el.querySelector(selector) !== null;

/**
 * Classifies one slot. Evidence-based tri-state when the profile has an
 * `occupancy` signature; legacy binary `filled` selector otherwise (fixtures);
 * UNKNOWN when neither exists or the signals are missing/contradictory.
 */
export function classifySlot(el: Element, slots: SlotsProfile): { state: SlotOccupancy; warning: string | null } {
  if (slots.locked && matchesOrContains(el, slots.locked)) return { state: 'LOCKED', warning: null };
  if (slots.occupancy) {
    const { container, filledClass, emptyClass } = slots.occupancy;
    const containers = el.querySelectorAll(container);
    if (containers.length !== 1) return { state: 'UNKNOWN', warning: containers.length > 1 ? 'multiple occupancy containers in slot' : null };
    const node = containers[0];
    const filled = node?.classList.contains(filledClass) ?? false;
    const empty = node?.classList.contains(emptyClass) ?? false;
    if (filled && empty) return { state: 'UNKNOWN', warning: `contradictory occupancy classes (${filledClass} + ${emptyClass})` };
    if (filled) return { state: 'FILLED', warning: null };
    if (empty) return { state: 'EMPTY', warning: null };
    return { state: 'UNKNOWN', warning: null };
  }
  if (slots.filled) return { state: matchesOrContains(el, slots.filled) ? 'FILLED' : 'EMPTY', warning: null };
  return { state: 'UNKNOWN', warning: null };
}

export function readSlots(doc: Document, profile: SbcProfile): SlotSummary | null {
  if (!profile.pitchRoot || !profile.slots) return null;
  const pitch = doc.querySelector(profile.pitchRoot);
  if (!pitch) return null;
  const slotsProfile = profile.slots;
  const warnings = new Set<string>();
  const states = [...pitch.querySelectorAll(slotsProfile.slot)].map((el, index) => {
    const { state, warning } = classifySlot(el, slotsProfile);
    if (warning) warnings.add(`slot ${index}: ${warning}`);
    return state;
  });
  const locked = states.filter((s) => s === 'LOCKED').length;
  const active = states.filter((s) => s !== 'LOCKED');
  const anyUnknown = active.some((s) => s === 'UNKNOWN');
  return {
    total: states.length,
    active: active.length,
    filled: anyUnknown ? null : active.filter((s) => s === 'FILLED').length,
    locked,
    states,
    warnings: [...warnings],
  };
}

/**
 * True when occupancy looks mid-transition: some active slots classify cleanly
 * while others are UNKNOWN (EA swapping a card in/out). A pitch where NO slot
 * classifies is a structural mismatch, not a transition, and is not "unsettled".
 * Observation waits (once, bounded) for the DOM to settle before re-reading.
 */
export function slotsUnsettled(doc: Document, profile: SbcProfile): boolean {
  const summary = readSlots(doc, profile);
  if (!summary) return false;
  const active = summary.states.filter((s) => s !== 'LOCKED');
  return active.some((s) => s === 'UNKNOWN') && active.some((s) => s === 'EMPTY' || s === 'FILLED');
}

/** Cheap fingerprint of everything the SBC reader depends on. */
export function sbcFingerprint(doc: Document, profile: SbcProfile): string | null {
  const root = doc.querySelector(profile.requirementsRoot);
  if (!root) return null;
  const rows = extractRequirementRows(root, profile).map((r) => `${normalizeText(r.text)}|${r.completed}|${r.assets.map((a) => a.src).join(',')}`);
  // Verified per-slot occupancy participates; profiles without an occupancy
  // signature contribute only constant UNKNOWN states (no false changes).
  const summary = readSlots(doc, profile);
  const slots = summary && { total: summary.total, locked: summary.locked, states: summary.states };
  const name = profile.name ? (doc.querySelector(profile.name)?.textContent ?? '').trim() : '';
  const attrs = profile.structural
    ? [profile.structural.challengeIdAttr, profile.structural.squadSizeAttr].map((a) => root.getAttribute(a) ?? '').join('|')
    : '';
  return fnv1a(JSON.stringify({ rows, slots, name, attrs }));
}
