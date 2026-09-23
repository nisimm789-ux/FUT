import { readFixturePage, type FixturePage } from '@fc/ea-fixtures';

export function loadPage(name: FixturePage): void {
  const parsed = new DOMParser().parseFromString(readFixturePage(name), 'text/html');
  // Keep the same <html> element (observers stay attached); swap its attributes and content.
  const html = document.documentElement;
  for (const attr of [...html.attributes]) html.removeAttribute(attr.name);
  for (const attr of [...parsed.documentElement.attributes]) html.setAttribute(attr.name, attr.value);
  html.innerHTML = parsed.documentElement.innerHTML;
}
