import { readFixturePage, type FixturePage } from '@fc/ea-fixtures';

/** Loads a fixture page into the test document (happy-dom). */
export function loadPage(name: FixturePage): Document {
  const parsed = new DOMParser().parseFromString(readFixturePage(name), 'text/html');
  // Keep the same <html> element (observers stay attached); swap its attributes and content.
  const html = document.documentElement;
  for (const attr of [...html.attributes]) html.removeAttribute(attr.name);
  for (const attr of [...parsed.documentElement.attributes]) html.setAttribute(attr.name, attr.value);
  html.innerHTML = parsed.documentElement.innerHTML;
  return document;
}

export const fakeWindow = () => window;
