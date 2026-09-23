/**
 * The ONLY hosts the content script runs on: the EA FC Web App path, with and
 * without a locale segment (e.g. /fr-fr/). Confirmed FC 27 URL:
 * https://www.ea.com/ea-sports-fc/ultimate-team/web-app/
 *
 * The locale wildcard would also match EA's marketing page
 * (/games/ea-sports-fc/ultimate-team/web-app/), so that path is excluded.
 * No host_permissions are needed: static content scripts are injected by
 * `matches`, and the extension makes no network requests.
 */
export const EA_WEB_APP_MATCHES = [
  'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*',
  'https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app/*',
] as const;

export const EA_WEB_APP_EXCLUDES = ['https://www.ea.com/games/*'] as const;

export const DEV_FIXTURE_MATCHES = ['http://localhost:4173/*'] as const;

export function contentScriptMatches(mode: string | undefined): string[] {
  return mode === 'development' ? [...EA_WEB_APP_MATCHES, ...DEV_FIXTURE_MATCHES] : [...EA_WEB_APP_MATCHES];
}
