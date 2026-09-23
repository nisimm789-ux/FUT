import { ReadFailure } from './types.js';

/** Strict helpers: anything unexpected throws a categorized ReadFailure (fail closed). */

export function requireElement<E extends Element>(root: ParentNode, selector: string, what: string): E {
  const el = root.querySelector<E>(selector);
  if (!el) throw new ReadFailure('STRUCTURE_NOT_FOUND', `${what} not found`);
  return el;
}

export function requireAttr(el: Element, attr: string, what: string): string {
  const value = el.getAttribute(attr);
  if (value === null || value.trim() === '') throw new ReadFailure('FIELD_MISSING', `${what} missing`);
  return value.trim();
}

export function parseIntStrict(raw: string | null | undefined, what: string, min: number, max: number): number {
  const text = raw?.trim() ?? '';
  if (!/^\d{1,9}$/.test(text)) throw new ReadFailure('FIELD_MISSING', `${what} is not an integer`);
  const n = Number(text);
  if (n < min || n > max) throw new ReadFailure('VALUE_OUT_OF_RANGE', `${what} out of range`);
  return n;
}

export function optionalInt(raw: string | null, what: string, min: number, max: number): number | undefined {
  return raw === null ? undefined : parseIntStrict(raw, what, min, max);
}

export function idFromAsset(img: HTMLImageElement | null, pattern: RegExp, what: string): number {
  const src = img?.getAttribute('src') ?? '';
  const match = pattern.exec(src);
  if (!match?.[1]) throw new ReadFailure('FIELD_MISSING', `${what} asset id missing`);
  return parseIntStrict(match[1], what, 0, 999_999_999);
}
