import { readFc27Page, readFixturePage, type Fc27Page, type FixturePage } from '@fc/ea-fixtures';

/** Replace the test document's content (keeps the same <html> element so observers stay attached). */
export function loadHtml(source: string): Document {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const html = document.documentElement;
  for (const attr of [...html.attributes]) html.removeAttribute(attr.name);
  for (const attr of [...parsed.documentElement.attributes]) html.setAttribute(attr.name, attr.value);
  html.innerHTML = parsed.documentElement.innerHTML;
  return document;
}

export const loadPage = (name: FixturePage): Document => loadHtml(readFixturePage(name));
export const loadFc27 = (name: Fc27Page): Document => loadHtml(readFc27Page(name));

export const LIVE_URL = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/';
export const LOCAL_URL = 'http://localhost:4173/site/fc27.html';
