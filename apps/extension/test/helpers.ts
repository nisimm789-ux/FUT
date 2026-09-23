import { readFc27Page, readFixturePage, type Fc27Page, type FixturePage } from '@fc/ea-fixtures';

export function loadHtml(source: string): void {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const html = document.documentElement;
  for (const attr of [...html.attributes]) html.removeAttribute(attr.name);
  for (const attr of [...parsed.documentElement.attributes]) html.setAttribute(attr.name, attr.value);
  html.innerHTML = parsed.documentElement.innerHTML;
}

export const loadPage = (name: FixturePage) => loadHtml(readFixturePage(name));
export const loadFc27 = (name: Fc27Page) => loadHtml(readFc27Page(name));
export const LIVE_URL = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/';
