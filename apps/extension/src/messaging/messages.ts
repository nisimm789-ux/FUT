import { z } from 'zod';
import {
  AdapterHealthSchema,
  ClubSnapshotSchema,
  EaContextSnapshotSchema,
  SbcChallengeSnapshotSchema,
} from '@fc/contracts';

/** Everything the side panel knows about one tab. Stored in chrome.storage.session. */
export const TabStateSchema = z.object({
  context: EaContextSnapshotSchema,
  health: AdapterHealthSchema,
  sbc: SbcChallengeSnapshotSchema.nullable(),
  club: ClubSnapshotSchema.nullable(),
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
export const PanelToContentSchema = z.discriminatedUnion('type', [z.object({ type: z.literal('REFRESH') })]);
export type PanelToContent = z.infer<typeof PanelToContentSchema>;

export const tabStateKey = (tabId: number) => `tab:${tabId}`;
