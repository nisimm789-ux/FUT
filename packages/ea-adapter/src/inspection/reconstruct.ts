import { InspectionReportSchema } from '@fc/contracts';
import type { InspectionNode, InspectionReport } from '@fc/contracts';
import { fc27LiveProfile } from '../profiles/fc27-live.js';
import type { EaAdapterProfile } from '../profiles/types.js';
import { findSensitiveContent } from './sensitive.js';

/** First class name in a selector list (e.g. ".a .b, .c" -> "a"). */
const firstClass = (selector: string | undefined): string | null => (selector ? (/\.([A-Za-z0-9_-]+)/.exec(selector)?.[1] ?? null) : null);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const VOID = new Set(['img', 'br', 'hr', 'input', 'source']);
const SAFE_TAGS = /^(div|span|section|article|header|footer|main|nav|ul|ol|li|h[1-6]|p|button|img|label|strong|em|small|table|tbody|thead|tr|td|th|figure|figcaption|a)$/;

/**
 * Turns a sanitized inspection report into a MINIMAL HTML fixture: only the
 * captured skeleton (tags, EA/state classes, data-* names, catalog asset ids,
 * sanitized requirement text). Enough for reader/detector regression tests;
 * nothing else from the original page exists in the report to begin with.
 */
export function reportToFixtureHtml(input: unknown, title: string, profile: EaAdapterProfile = fc27LiveProfile): string {
  const report: InspectionReport = InspectionReportSchema.parse(input);
  const pitchClass = firstClass(profile.sbc?.pitchRoot);
  const slotClass = firstClass(profile.sbc?.slots?.slot);
  const filledClass = firstClass(profile.sbc?.slots?.filled);
  const lockedClass = firstClass(profile.sbc?.slots?.locked);
  // App-shell and tab-bar wrappers satisfy the live profile's probe().
  const rootClass = 'ut-root-view';
  const nav = report.navigation
    .map((n) => `    <button class="${esc([...n.classes, ...(n.selected && !n.classes.includes('selected') ? ['selected'] : [])].join(' '))}"></button>`)
    .join('\n');
  const treeViews = new Set<string>();
  const collect = (n: InspectionNode) => {
    n.classes.forEach((c) => treeViews.add(c));
    n.children.forEach(collect);
  };
  if (report.sbc.tree) collect(report.sbc.tree);
  // The pitch is rebuilt from slot counts below; don't also emit placeholders for its classes.
  const rebuilt = new Set([pitchClass, slotClass, filledClass, rootClass, 'ut-tab-bar-view'].filter((c): c is string => c !== null));
  const extraViews = report.views
    .filter((v) => !treeViews.has(v.className) && !rebuilt.has(v.className))
    .map((v) => `    <div class="${esc(v.className)}"></div>`)
    .join('\n');
  const slots = report.sbc.slots;
  const pitch =
    slots && pitchClass && slotClass && filledClass
      ? `    <div class="${pitchClass}">\n${Array.from({ length: slots.total }, (_, i) => {
          const locked = i >= slots.total - slots.locked;
          const filled = !locked && i < slots.filled;
          return `      <div class="${slotClass}${locked && lockedClass ? ` ${lockedClass}` : ''}">${filled ? `<div class="${filledClass}"></div>` : ''}</div>`;
        }).join('\n')}\n    </div>`
      : '';
  const tree = report.sbc.tree ? renderNode(report.sbc.tree, 2) : '';
  const lang = report.document.lang && /^[a-z]{2}(-[a-z0-9]{2,8})?$/i.test(report.document.lang) ? report.document.lang : 'en';
  const html = `<!doctype html>
<!-- Generated from a sanitized inspection report (reportVersion ${report.reportVersion}, profile ${esc(report.meta.profileId)}, adapter ${esc(report.meta.adapterVersion)}). -->
<!-- Captured context: ${report.context.kind}. Do not hand-edit; regenerate with pnpm fixtures:from-report. -->
<html lang="${esc(lang)}">
<head><meta charset="utf-8"><title>${esc(title)} (captured fixture)</title></head>
<body>
<div class="${rootClass}">
  <nav class="ut-tab-bar-view">
${nav}
  </nav>
  <main class="ut-content">
${extraViews}
${pitch}
${tree}
  </main>
</div>
</body>
</html>
`;
  const findings = findSensitiveContent(html);
  if (findings.length > 0) throw new Error(`refusing to write fixture: ${findings.map((f) => f.rule).join(', ')}`);
  return html;
}

function renderNode(node: InspectionNode, indent: number): string {
  const pad = '  '.repeat(indent);
  const tag = SAFE_TAGS.test(node.tag) ? node.tag : 'div';
  const attrs = [
    node.classes.length > 0 ? `class="${esc(node.classes.join(' '))}"` : '',
    ...node.dataAttributes.map((a) => `${a}=""`),
    node.role ? `role="${esc(node.role)}"` : '',
    tag === 'img' && node.asset ? `src="/fixture-assets/${esc(node.asset.kind)}/${node.asset.id ?? 0}.png" alt=""` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const open = `<${tag}${attrs ? ` ${attrs}` : ''}>`;
  if (VOID.has(tag)) return `${pad}${open}`;
  const text = node.text !== null && node.children.length === 0 ? esc(node.text) : '';
  const rowText = node.text !== null && node.children.length > 0 ? `\n${pad}  <span>${esc(node.text)}</span>` : '';
  const kids = node.children.map((c) => renderNode(c, indent + 1)).join('\n');
  if (!kids && !rowText) return `${pad}${open}${text}</${tag}>`;
  return `${pad}${open}${rowText}${kids ? `\n${kids}` : ''}\n${pad}</${tag}>`;
}
