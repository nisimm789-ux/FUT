/** Lowercase, strip diacritics, turn punctuation into spaces, collapse whitespace. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Same text with every number masked: groups requirements by shape, not value. */
export function maskNumbers(normalized: string): string {
  return normalized.replace(/\d+/g, '#');
}

/** True if `phrase` occurs in `text` on word boundaries (both normalized). */
export function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}
