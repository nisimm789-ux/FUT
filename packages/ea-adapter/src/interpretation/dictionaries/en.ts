import type { RequirementDictionary } from '../types.js';

/** English. Candidate wording; confirm against the live FC 27 UI. */
export const en: RequirementDictionary = {
  locale: 'en',
  verified: false,
  operators: { min: ['min', 'minimum', 'at least'], max: ['max', 'maximum', 'at most'], exact: ['exactly', 'exact'] },
  subjects: {
    TEAM_RATING: ['team rating', 'squad rating', 'team overall'],
    CHEMISTRY: ['chemistry', 'team chemistry', 'total chemistry', 'squad chemistry'],
    SQUAD_SIZE: ['number of players in the squad', 'players in the squad', 'players in squad', 'of players in the squad'],
    PLAYER_RATING: ['player rating', 'player overall'],
    PLAYER_QUALITY: ['player quality', 'quality'],
    RARE: ['rare', 'rares', 'rare players'],
    GOLD: ['gold players'],
    SILVER: ['silver players'],
    BRONZE: ['bronze players'],
    SAME_CLUB: ['same club', 'same club count', 'players from the same club'],
    SAME_LEAGUE: ['same league', 'same league count', 'players from the same league'],
    SAME_NATION: ['same nation', 'same nationality', 'same country', 'same country region', 'same nation count'],
    UNIQUE_CLUBS: ['clubs'],
    UNIQUE_LEAGUES: ['leagues'],
    UNIQUE_NATIONS: ['nations', 'nationalities', 'countries', 'countries regions'],
    TOTW: ['team of the week', 'totw'],
    TOTS: ['team of the season', 'tots'],
    IN_FORM: ['in form', 'inform'],
    FROM_NATION: ['nation', 'nationality', 'country', 'country region'],
    FROM_LEAGUE: ['league'],
    FROM_CLUB: ['club'],
    OTHER: ['chemistry points per player', 'chemistry per player', 'per player', 'loyalty', 'first owner', 'evolution', 'evolved', 'icons', 'heroes'],
  },
  qualities: { BRONZE: ['bronze'], SILVER: ['silver'], GOLD: ['gold'] },
};
