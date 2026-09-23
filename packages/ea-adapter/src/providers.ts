import type { ClubProvider, ProviderResult, SbcProvider } from '@fc/domain';
import type { ClubSnapshot, SbcChallengeSnapshot } from '@fc/contracts';
import type { EaWebAdapter } from './adapter.js';
import type { ReadResult } from './readers/types.js';

function toProvider<T>(result: ReadResult<T>): ProviderResult<T> {
  if (result.ok) return { ok: true, value: result.value };
  return {
    ok: false,
    error: { code: result.category === 'PROFILE_MISMATCH' ? 'UNSUPPORTED' : 'PARSE_FAILED', message: result.message },
  };
}

/**
 * EaWebProvider: implements the domain provider ports on top of the DOM
 * adapter. Other sources (e.g. EaCommunityApiProvider) implement the same ports.
 */
export function createEaWebProviders(adapter: EaWebAdapter): { sbc: SbcProvider; club: ClubProvider } {
  return {
    sbc: {
      providerId: 'ea-web',
      getCurrentChallenge: (): Promise<ProviderResult<SbcChallengeSnapshot>> => Promise.resolve(toProvider(adapter.readSbcChallenge())),
    },
    club: {
      providerId: 'ea-web',
      getClubSnapshot: (): Promise<ProviderResult<ClubSnapshot>> => Promise.resolve(toProvider(adapter.readClub())),
    },
  };
}
