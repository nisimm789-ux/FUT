import { z } from 'zod';
import { SolverStrategySchema } from '@fc/contracts';
import type { PreferenceStore } from '@fc/domain';

export const PreferencesSchema = z.object({
  strategy: SolverStrategySchema,
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = { strategy: 'BALANCED' };
const KEY = 'preferences:v1';

export async function loadPreferences(store: PreferenceStore): Promise<Preferences> {
  const parsed = PreferencesSchema.safeParse(await store.get(KEY));
  return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
}

export function savePreferences(store: PreferenceStore, prefs: Preferences): Promise<void> {
  return store.set(KEY, PreferencesSchema.parse(prefs));
}
