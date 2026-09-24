import type { InspectionSlot } from '@fc/contracts';
import { fnv1a } from '../hash.js';
import type { SbcProfile } from '../profiles/types.js';
import { SAFE_CLASS_TOKEN, assetOf, describeNode } from './node.js';

const OPAQUE = new Set(['input', 'textarea', 'select', 'option', 'script', 'style', 'noscript', 'template', 'iframe']);
/** data-* names whose short token values are structural (never names/ids). */
const STRUCTURAL_DATA_NAMES = /^data-(index|slot|slot-index|position|pos|state|status|type|kind|role|variant|size|empty|filled|locked|active|selected|disabled)$/;

function matchesOrContains(el: Element, selector: string | undefined): boolean | null {
  if (!selector) return null;
  return el.matches(selector) || el.querySelector(selector) !== null;
}

/** Structure-only signature of an element subtree: tags, safe classes, nesting. */
function structureSignature(el: Element, depth = 0): string {
  if (depth > 12) return '…';
  const tag = el.tagName.toLowerCase();
  if (OPAQUE.has(tag)) return tag;
  const cls = [...el.classList].map((c) => c.toLowerCase()).filter(SAFE_CLASS_TOKEN).sort().join('.');
  return `${tag}${cls ? `.${cls}` : ''}(${[...el.children].map((c) => structureSignature(c, depth + 1)).join(',')})`;
}

/**
 * Per-slot structural evidence for the SBC pitch (development Inspection Mode).
 * Captures classes, tag/element counts, asset KINDS, text-node COUNTS and a
 * structural fingerprint — never text, asset ids, or free-form attribute values.
 */
export function describeSlots(doc: Document, profile: SbcProfile): { pitchFound: boolean; slots: InspectionSlot[] } {
  const pitch = profile.pitchRoot ? doc.querySelector(profile.pitchRoot) : null;
  if (!pitch || !profile.slots) return { pitchFound: pitch !== null, slots: [] };
  const slots = [...pitch.querySelectorAll(profile.slots.slot)].slice(0, 30).map((slot, index): InspectionSlot => {
    const descendantClasses = new Map<string, number>();
    const tagCounts: Record<string, number> = {};
    const dataAttributes = new Set<string>();
    const safeDataValues = new Map<string, string>();
    const assetKinds = new Set<string>();
    const text = { total: 0, withDigits: 0, withLetters: 0 };
    let descendantCount = 0;
    let maxDepth = 0;

    const collectAttrs = (el: Element) => {
      for (const name of el.getAttributeNames()) {
        if (!/^data-[a-z0-9-]{1,48}$/.test(name)) continue;
        dataAttributes.add(name);
        const value = (el.getAttribute(name) ?? '').trim();
        if (/^[0-9]{1,2}$/.test(value) || (STRUCTURAL_DATA_NAMES.test(name) && /^[a-z][a-z_-]{0,15}$/.test(value))) {
          if (!safeDataValues.has(name)) safeDataValues.set(name, value);
        }
      }
    };
    const walk = (node: Node, depth: number) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          const t = (child.textContent ?? '').trim();
          if (t) {
            text.total += 1;
            if (/\d/.test(t)) text.withDigits += 1;
            if (/\p{L}/u.test(t)) text.withLetters += 1;
          }
          continue;
        }
        if (child.nodeType !== 1) continue;
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        descendantCount += 1;
        maxDepth = Math.max(maxDepth, depth);
        if (/^[a-z][a-z0-9-]{0,31}$/.test(tag)) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
        for (const c of el.classList) {
          const token = c.toLowerCase();
          if (SAFE_CLASS_TOKEN(token)) descendantClasses.set(token, (descendantClasses.get(token) ?? 0) + 1);
        }
        collectAttrs(el);
        const asset = assetOf(el, false);
        if (asset) assetKinds.add(asset.kind);
        if (OPAQUE.has(tag) || tag === 'svg' || el.hasAttribute('contenteditable')) continue;
        walk(el, depth + 1);
      }
    };
    collectAttrs(slot);
    walk(slot, 1);

    const locked = matchesOrContains(slot, profile.slots?.locked);
    const filled = matchesOrContains(slot, profile.slots?.filled);
    return {
      index,
      lockedBySignature: locked,
      filledBySignature: filled === null ? null : !locked && filled,
      classes: [...new Set([...slot.classList].map((c) => c.toLowerCase()).filter(SAFE_CLASS_TOKEN))].sort().slice(0, 24),
      descendantClasses: [...descendantClasses.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 64).map(([className, count]) => ({ className, count })),
      tagCounts,
      descendantCount,
      maxDepth,
      imgCount: tagCounts.img ?? 0,
      canvasCount: tagCounts.canvas ?? 0,
      svgCount: tagCounts.svg ?? 0,
      assetKinds: [...assetKinds].sort().slice(0, 8),
      textNodes: text,
      dataAttributes: [...dataAttributes].sort().slice(0, 24),
      safeDataValues: [...safeDataValues.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 16).map(([name, value]) => ({ name, value })),
      structuralFingerprint: fnv1a(structureSignature(slot)),
      tree: describeNode(slot, { maxDepth: 6, maxChildren: 12, captureText: false, keepCatalogIds: false, keepClass: SAFE_CLASS_TOKEN, budget: { nodes: 60, redactions: 0 } }),
    };
  });
  return { pitchFound: true, slots };
}
