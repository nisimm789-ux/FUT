import { z } from 'zod';
import {
  AdapterHealthSchema,
  AdapterPerfSchema,
  CapabilityNameSchema,
  ClubSnapshotSchema,
  EaContextSnapshotSchema,
  InspectionReportSchema,
  ParserFailureCategorySchema,
  SbcChallengeSnapshotSchema,
} from '@fc/contracts';

/**
 * Why a previously read snapshot is no longer current. Stale data may still
 * be shown, but always visibly marked — never presented as the current state.
 */
export const StaleReasonSchema = z.enum(['CONTEXT_LEFT', 'READ_FAILED', 'READS_DISABLED']);
export type StaleReason = z.infer<typeof StaleReasonSchema>;

const slot = <S extends z.ZodType>(snapshot: S) =>
  z.object({
    snapshot,
    freshness: z.enum(['current', 'stale']),
    staleReason: StaleReasonSchema.nullable(),
    lastReadAt: z.number().int().nonnegative(),
  });

export const SbcSlotSchema = slot(SbcChallengeSnapshotSchema);
export type SbcSlot = z.infer<typeof SbcSlotSchema>;
export const ClubSlotSchema = slot(ClubSnapshotSchema);
export type ClubSlot = z.infer<typeof ClubSlotSchema>;

/** Everything the side panel knows about one tab. Stored in chrome.storage.session. */
export const TabStateSchema = z.object({
  context: EaContextSnapshotSchema,
  health: AdapterHealthSchema,
  sbc: SbcSlotSchema.nullable(),
  club: ClubSlotSchema.nullable(),
  lastReadError: z
    .object({ capability: CapabilityNameSchema, category: ParserFailureCategorySchema, message: z.string().max(200), at: z.number().int() })
    .nullable(),
  perf: AdapterPerfSchema,
  updatedAt: z.number().int().nonnegative(),
});
export type TabState = z.infer<typeof TabStateSchema>;

/** content script -> service worker */
export const ContentToBackgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('STATE_UPDATE'), state: TabStateSchema }),
  z.object({ type: z.literal('OPEN_SIDE_PANEL') }),
]);
export type ContentToBackground = z.infer<typeof ContentToBackgroundSchema>;

/** side panel -> content script */
export const PanelToContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('REFRESH') }),
  /** Development builds only; production content scripts ignore it. */
  z.object({ type: z.literal('INSPECT') }),
]);
export type PanelToContent = z.infer<typeof PanelToContentSchema>;

export const InspectResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), report: InspectionReportSchema }),
  z.object({ ok: z.literal(false), reason: z.string().max(64), details: z.array(z.string().max(200)).max(20) }),
]);
export type InspectResponse = z.infer<typeof InspectResponseSchema>;

export const tabStateKey = (tabId: number) => `tab:${tabId}`;
