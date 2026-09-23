/**
 * Detector for content that must never appear in an exported inspection
 * report or in a committed fixture. Used (a) as a last-line check before a
 * report can be exported and (b) by the CI fixture sanitization test.
 * False positives are acceptable; false negatives are not.
 */
export interface SensitiveFinding {
  rule: string;
  /** Short masked excerpt for debugging, never the full match. */
  excerpt: string;
}

export const SENSITIVE_RULES: readonly { rule: string; pattern: RegExp }[] = [
  { rule: 'email-address', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { rule: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { rule: 'bearer-token', pattern: /\bbearer\s+[A-Za-z0-9._~+/-]{8,}/gi },
  { rule: 'auth-header-or-cookie-name', pattern: /\b(x-ut-sid|x-ut-phishing-token|easw-session|authorization|set-cookie|remid|_nx_mpcid|webun|sid=)/gi },
  { rule: 'credential-keyword', pattern: /\b(access_token|refresh_token|id_token|password|passwd|auth_code|otp_code|two_factor|2fa_code)\b/gi },
  { rule: 'account-identifier-key', pattern: /\b(nucleus_?id|persona_?id|pid_?id|user_?id|gamertag|psn_?id|xbox_?id|ea_?id)\b\s*[:=]/gi },
  { rule: 'long-hex-secret', pattern: /\b[0-9a-f]{32,}\b/gi },
  { rule: 'long-base64-blob', pattern: /[A-Za-z0-9+/]{48,}={0,2}/g },
  { rule: 'input-value', pattern: /<input\b[^>]*\bvalue\s*=/gi },
  { rule: 'password-field', pattern: /type\s*=\s*["']?password/gi },
  { rule: 'storage-dump', pattern: /\b(document\.cookie|localStorage|sessionStorage|indexedDB)\b/g },
  { rule: 'script-tag', pattern: /<script\b/gi },
];

export function findSensitiveContent(text: string): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];
  for (const { rule, pattern } of SENSITIVE_RULES) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const m = match[0];
      findings.push({ rule, excerpt: `${m.slice(0, 4)}…(${m.length})` });
      if (findings.length > 50) return findings;
    }
  }
  return findings;
}
