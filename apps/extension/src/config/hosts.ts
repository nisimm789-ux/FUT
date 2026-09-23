/**
 * The ONLY hosts the content script runs on. Kept deliberately narrow:
 * the EA FC Web App path (with and without a locale segment). The local
 * fixture host is added only to development builds.
 */
export const EA_WEB_APP_MATCHES = [
  'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*',
  'https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app/*',
] as const;

export const DEV_FIXTURE_MATCHES = ['http://localhost:4173/*'] as const;

export function contentScriptMatches(mode: string | undefined): string[] {
  return mode === 'development' ? [...EA_WEB_APP_MATCHES, ...DEV_FIXTURE_MATCHES] : [...EA_WEB_APP_MATCHES];
}
