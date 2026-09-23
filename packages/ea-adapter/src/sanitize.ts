/**
 * Text sanitization for anything that may leave the page (diagnostics,
 * inspection reports, UNKNOWN requirement descriptions). Conservative: it
 * removes things that look like identifiers even if that loses information.
 */
export interface Sanitized {
  text: string;
  redactions: number;
}

const RULES: readonly [RegExp, string][] = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
  [/\bhttps?:\/\/\S+/gi, '[url]'],
  [/\b[A-Za-z0-9_-]{24,}\b/g, '[token]'],
  [/\d{6,}/g, '[n]'],
];

export function sanitizeText(input: string, maxLength = 120): Sanitized {
  let text = input.replace(/\s+/g, ' ').trim();
  let redactions = 0;
  for (const [pattern, replacement] of RULES) {
    text = text.replace(pattern, () => {
      redactions += 1;
      return replacement;
    });
  }
  if (text.length > maxLength) text = `${text.slice(0, maxLength - 1)}…`;
  return { text, redactions };
}

/** Path/route sanitizer: keeps word-like segments and locales, masks id-like ones. */
export function sanitizePath(path: string): string {
  return path
    .split('/')
    .map((segment) => (segment === '' || /^[a-z][a-z-]{0,39}$/i.test(segment) ? segment : ':id'))
    .join('/')
    .slice(0, 200);
}
