import { InspectionReportSchema } from '@fc/contracts';
import type { EaContextSnapshot, InspectionNode, InspectionReport } from '@fc/contracts';
import type { EaWebAdapter } from '../adapter.js';
import { scoreContextRules } from '../context/detector.js';
import { extractRequirementRows, readSlots } from '../readers/sbc-rows.js';
import { sanitizePath, sanitizeText } from '../sanitize.js';
import { ADAPTER_VERSION } from '../version.js';
import { describeNode } from './node.js';
import { findSensitiveContent } from './sensitive.js';

export interface InspectOptions {
  adapter: EaWebAdapter;
  document: Document;
  url: string;
  extensionVersion: string;
  now: number;
}

export type InspectionResult =
  | { ok: true; report: InspectionReport }
  | { ok: false; reason: 'SENSITIVE_CONTENT_DETECTED' | 'SCHEMA_VIOLATION'; details: string[] };

export const NEVER_COLLECTED = [
  'cookies',
  'web storage',
  'network requests/headers',
  'auth tokens',
  'input values',
  'full HTML',
  'account identifiers',
] as const;

/**
 * Development-only: describe the current EA screen structurally so unknown
 * FC 27 screens can be understood safely. Reads only the rendered DOM; never
 * cookies, storage, network data or form input values. Text is captured only
 * inside SBC requirement rows, sanitized. The result is schema-validated and
 * scanned for sensitive content before it can be exported.
 */
export function inspectCurrentScreen(options: InspectOptions): InspectionResult {
  const { adapter, document: doc } = options;
  const profile = adapter.activeProfile();
  const budget = { nodes: 600, redactions: 0 };
  const context: EaContextSnapshot = adapter.detectContext();
  const url = safeUrl(options.url);

  const views = new Map<string, number>();
  for (const el of doc.querySelectorAll('[class*="ut-"]')) {
    for (const c of el.classList) if (/^ut-[a-z0-9-]{1,58}-view$/.test(c)) views.set(c, (views.get(c) ?? 0) + 1);
  }

  const navigation = profile?.navigation
    ? [...doc.querySelectorAll(profile.navigation.item)].slice(0, 16).map((el) => ({
        classes: [...el.classList].filter((c) => /^(ut-|icon-)[a-z0-9-]{1,40}$/.test(c) || c === profile.navigation?.selectedClass).sort().slice(0, 8),
        selected:
          el.classList.contains(profile.navigation?.selectedClass ?? 'selected') ||
          el.getAttribute('aria-selected') === 'true' ||
          el.hasAttribute('aria-current'),
      }))
    : [];

  const landmarks: Record<string, number> = {};
  for (const tag of ['main', 'nav', 'header', 'section', 'dialog', 'button', 'ul', 'li', 'img', 'input', 'canvas']) {
    landmarks[tag] = doc.getElementsByTagName(tag).length;
  }
  for (const el of doc.querySelectorAll('[role]')) {
    const role = el.getAttribute('role') ?? '';
    if (/^[a-z-]{1,20}$/.test(role)) landmarks[`role-${role}`] = (landmarks[`role-${role}`] ?? 0) + 1;
  }

  const sbcProfile = profile?.sbc;
  const sbcRoot = sbcProfile ? doc.querySelector(sbcProfile.requirementsRoot) : null;
  const requirementRows =
    sbcProfile && sbcRoot
      ? extractRequirementRows(sbcRoot, sbcProfile).slice(0, 20).map((row, index) => {
          const text = sanitizeText(row.text);
          budget.redactions += text.redactions;
          const interpretation = adapter.interpreter.interpret(row.evidence, adapter.readerContext().locale);
          return {
            index,
            structuralFingerprint: row.structuralFingerprint,
            text: text.text || null,
            completed: row.completed,
            assets: row.assets.slice(0, 8).map((a) => ({ kind: a.kind, id: a.id })),
            interpretedAs: interpretation.ok ? interpretation.requirement.type : `UNKNOWN:${interpretation.reason}`,
          };
        })
      : [];
  const tree =
    sbcRoot && sbcProfile
      ? describeTreeWithRowText(sbcRoot, sbcProfile.requirementRow, budget)
      : null;

  const dry = adapter.dryReadSbc();
  const report: InspectionReport = {
    reportVersion: 1,
    meta: {
      generatedAt: new Date(options.now).toISOString(),
      extensionVersion: options.extensionVersion.slice(0, 32),
      adapterVersion: ADAPTER_VERSION,
      profileId: profile?.id ?? 'none',
      profileVerified: profile?.verified ?? false,
      fcVersion: profile?.fcVersion ?? 'NONE',
    },
    location: url,
    document: { lang: (doc.documentElement.getAttribute('lang') ?? '').slice(0, 16) || null },
    context: { kind: context.kind, confidence: context.confidence, signals: context.signals },
    ruleScores: profile
      ? scoreContextRules(doc, options.url, profile)
          .filter((s) => s.score > 0)
          .map((s) => ({ kind: s.kind, score: s.score, signals: s.signals }))
      : [],
    views: [...views.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 64).map(([className, count]) => ({ className, count })),
    navigation,
    landmarks,
    sbc: {
      rootFound: sbcRoot !== null,
      requirementRows,
      slots: sbcProfile ? pickSlots(readSlots(doc, sbcProfile)) : null,
      tree,
    },
    candidates: requirementListCandidates(doc, budget),
    readerDiagnostics: {
      sbc: sbcProfile
        ? {
            ok: dry.ok,
            category: dry.ok ? null : dry.category,
            message: dry.ok ? null : sanitizeText(dry.message, 200).text,
            requirementTypes: dry.ok ? dry.value.requirements.map((r) => r.type) : [],
            unknownCount: dry.ok ? dry.value.requirements.filter((r) => r.type === 'UNKNOWN').length : 0,
            warnings: dry.ok ? (dry.warnings ?? []).slice(0, 10).map((w) => sanitizeText(w, 160).text) : [],
          }
        : null,
    },
    health: adapter.health.snapshot(),
    validationFailures: adapter.health.snapshot().recentFailures,
    perf: adapter.perf.snapshot(),
    safety: { redactions: budget.redactions, neverCollected: [...NEVER_COLLECTED] },
  };

  const parsed = InspectionReportSchema.safeParse(report);
  if (!parsed.success) {
    return { ok: false, reason: 'SCHEMA_VIOLATION', details: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  const findings = findSensitiveContent(JSON.stringify(parsed.data));
  if (findings.length > 0) return { ok: false, reason: 'SENSITIVE_CONTENT_DETECTED', details: findings.map((f) => `${f.rule} ${f.excerpt}`) };
  return { ok: true, report: parsed.data };
}

function pickSlots(s: { total: number; filled: number; locked: number } | null) {
  return s ? { total: s.total, filled: s.filled, locked: s.locked } : null;
}

function safeUrl(raw: string): InspectionReport['location'] {
  try {
    const u = new URL(raw);
    return {
      origin: u.origin,
      path: sanitizePath(u.pathname),
      route: sanitizePath(u.hash.replace(/^#/, '')),
      queryKeys: [...new Set([...u.searchParams.keys()].filter((k) => /^[A-Za-z0-9_-]{1,32}$/.test(k)))].sort().slice(0, 16),
    };
  } catch {
    return { origin: 'http://invalid', path: '', route: '', queryKeys: [] };
  }
}

/** Tree of the requirements container; requirement rows (and only they) carry sanitized text. */
function describeTreeWithRowText(root: Element, rowSelector: string, budget: { nodes: number; redactions: number }): InspectionNode {
  const rows = new Set(root.querySelectorAll(rowSelector));
  const walk = (el: Element, depth: number): InspectionNode => {
    const isRow = rows.has(el);
    const node = describeNode(el, { maxDepth: 0, maxChildren: 0, captureText: isRow, keepCatalogIds: false, budget });
    node.truncatedChildren = 0;
    if (depth >= 8) {
      node.truncatedChildren = el.childElementCount;
      return node;
    }
    for (const child of el.children) {
      if (node.children.length >= 24 || budget.nodes <= 0) {
        node.truncatedChildren += 1;
        continue;
      }
      node.children.push(
        isRow
          ? describeNode(child, { maxDepth: 4, maxChildren: 12, captureText: false, keepCatalogIds: true, budget })
          : walk(child, depth + 1),
      );
    }
    return node;
  };
  return walk(root, 0);
}

/** Heuristic fallback: lists under an element whose EA class mentions sbc/requirement/challenge. */
function requirementListCandidates(doc: Document, budget: { nodes: number; redactions: number }): InspectionReport['candidates'] {
  const out: InspectionReport['candidates'] = [];
  for (const list of doc.querySelectorAll('ul, ol')) {
    const rows = [...list.children].filter((c) => c.tagName === 'LI');
    if (rows.length < 2 || rows.length > 20) continue;
    const ancestry: string[] = [];
    let el: Element | null = list;
    while (el && ancestry.length < 6) {
      const utClass = [...el.classList].find((c) => /^ut-[a-z0-9-]{1,60}$/.test(c));
      if (utClass) ancestry.push(utClass);
      el = el.parentElement;
    }
    if (!ancestry.some((c) => /sbc|requirement|challenge|objective/.test(c))) continue;
    const rowClasses = [...new Set(rows.flatMap((r) => [...r.classList]).filter((c) => /^(ut-[a-z0-9-]{1,60}|complete|completed|is-complete)$/.test(c)))].sort().slice(0, 8);
    const first = rows[0];
    out.push({
      ancestry,
      listTag: list.tagName === 'OL' ? 'ol' : 'ul',
      rowCount: rows.length,
      rowClasses,
      sample: first ? describeNode(first, { maxDepth: 3, maxChildren: 8, captureText: true, keepCatalogIds: true, budget }) : null,
    });
    if (out.length >= 10) break;
  }
  return out;
}
