import type { InspectionNode, TextShape } from '@fc/contracts';
import { sanitizeText } from '../sanitize.js';
import { safeTextOf } from '../readers/sbc-rows.js';

/** Class tokens that describe EA structure or state; everything else is only counted. */
const STATE_CLASSES = new Set([
  'selected', 'active', 'disabled', 'locked', 'empty', 'filled', 'complete', 'completed', 'is-complete',
  'player', 'item', 'rare', 'common', 'special', 'gold', 'silver', 'bronze', 'untradeable', 'hidden',
]);
const KEEP_CLASS = (c: string) => /^ut-[a-z0-9-]{1,60}$/.test(c) || /^icon-[a-z0-9-]{1,40}$/.test(c) || STATE_CLASSES.has(c);

/** Never descended into, never described beyond their tag. */
const OPAQUE = new Set(['input', 'textarea', 'select', 'option', 'script', 'style', 'noscript', 'template', 'iframe', 'canvas', 'video', 'audio', 'object', 'embed']);
const CATALOG_ASSET_KINDS = new Set(['flag', 'flags', 'league', 'leagues', 'leaguelogos', 'club', 'clubs', 'clubbadges']);

export interface NodeOptions {
  maxDepth: number;
  maxChildren: number;
  /** Capture sanitized text (only ever true for SBC requirement rows). */
  captureText: boolean;
  /** Keep numeric ids for catalog assets (nation/league/club), only inside requirement rows. */
  keepCatalogIds: boolean;
  budget: { nodes: number; redactions: number };
}

export function textShape(text: string): TextShape {
  const n = text.length;
  return {
    length: n === 0 ? '0' : n <= 8 ? '1-8' : n <= 32 ? '9-32' : n <= 120 ? '33-120' : '120+',
    hasDigits: /\d/.test(text),
    hasLetters: /\p{L}/u.test(text),
  };
}

export function assetOf(el: Element, keepCatalogIds: boolean): InspectionNode['asset'] {
  if (el.tagName !== 'IMG') return null;
  const src = el.getAttribute('src') ?? '';
  const match = /\/([a-z]+)\/(?:[a-z0-9_-]+\/)*?(\d+)\.(?:png|webp|jpe?g|svg)(?:$|\?)/i.exec(src);
  if (!match?.[1]) return { kind: 'unknown', id: null };
  const kind = match[1].toLowerCase().slice(0, 32);
  const id = keepCatalogIds && CATALOG_ASSET_KINDS.has(kind) && match[2] ? Number(match[2]) : null;
  return { kind, id };
}

function ownText(el: Element): string {
  let text = '';
  for (const child of el.childNodes) if (child.nodeType === 3) text += child.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
}

/** Structural description of an element subtree. No attribute values, no text unless allowed. */
export function describeNode(el: Element, options: NodeOptions, depth = 0): InspectionNode {
  options.budget.nodes -= 1;
  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList];
  const kept = classes.filter(KEEP_CLASS).sort().slice(0, 16);
  const role = el.getAttribute('role');
  const opaque = OPAQUE.has(tag) || el.hasAttribute('contenteditable');
  let text: string | null = null;
  if (options.captureText && !opaque) {
    const sanitized = sanitizeText(safeTextOf(el));
    options.budget.redactions += sanitized.redactions;
    text = sanitized.text || null;
  }
  const node: InspectionNode = {
    tag: /^[a-z][a-z0-9-]{0,31}$/.test(tag) ? tag : 'x-unknown',
    role: role && /^[a-z][a-z0-9_-]{0,63}$/.test(role) ? role : null,
    classes: kept,
    otherClassCount: classes.length - kept.length,
    dataAttributes: el
      .getAttributeNames()
      .filter((n) => /^data-[a-z0-9-]{1,48}$/.test(n))
      .sort()
      .slice(0, 16),
    asset: assetOf(el, options.keepCatalogIds),
    textShape: opaque ? null : textShape(ownText(el)),
    text,
    children: [],
    truncatedChildren: 0,
  };
  if (opaque || depth >= options.maxDepth) {
    node.truncatedChildren = opaque ? 0 : el.childElementCount;
    return node;
  }
  const children = [...el.children];
  for (const child of children) {
    if (node.children.length >= options.maxChildren || options.budget.nodes <= 0) {
      node.truncatedChildren += 1;
      continue;
    }
    // Only requirement rows themselves carry text; their descendants carry shapes.
    node.children.push(describeNode(child, { ...options, captureText: false }, depth + 1));
  }
  return node;
}
