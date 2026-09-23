import { de } from './de.js';
import { en } from './en.js';
import { es } from './es.js';
import { fr } from './fr.js';
import type { RequirementDictionary } from '../types.js';

export { de, en, es, fr };

/** Bundled dictionaries. Data only; replaceable per profile or via DI. */
export const DEFAULT_DICTIONARIES: readonly RequirementDictionary[] = [en, de, fr, es];
