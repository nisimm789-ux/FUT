import type { RequirementDictionary } from '../types.js';

/** German. Candidate wording; confirm against the live FC 27 UI. */
export const de: RequirementDictionary = {
  locale: 'de',
  verified: false,
  operators: { min: ['min', 'mind', 'mindestens', 'minimum'], max: ['max', 'maximal', 'hochstens', 'maximum'], exact: ['genau', 'exakt'] },
  subjects: {
    TEAM_RATING: ['teambewertung', 'team bewertung', 'teamwertung', 'mannschaftsbewertung'],
    CHEMISTRY: ['chemie', 'teamchemie', 'team chemie', 'gesamtchemie'],
    SQUAD_SIZE: ['anzahl der spieler im team', 'spieler im team', 'anzahl spieler im team'],
    PLAYER_RATING: ['spielerbewertung'],
    PLAYER_QUALITY: ['spielerqualitat', 'qualitat'],
    RARE: ['seltene', 'selten', 'seltene spieler'],
    GOLD: ['goldspieler', 'gold spieler'],
    SILVER: ['silberspieler', 'silber spieler'],
    BRONZE: ['bronzespieler', 'bronze spieler'],
    SAME_CLUB: ['gleicher verein', 'selber verein', 'spieler aus demselben verein'],
    SAME_LEAGUE: ['gleiche liga', 'selbe liga', 'spieler aus derselben liga'],
    SAME_NATION: ['gleiche nation', 'selbe nation', 'gleiche nationalitat'],
    UNIQUE_CLUBS: ['vereine'],
    UNIQUE_LEAGUES: ['ligen'],
    UNIQUE_NATIONS: ['nationen', 'nationalitaten', 'lander'],
    TOTW: ['team der woche', 'totw'],
    TOTS: ['team der saison', 'tots'],
    IN_FORM: ['in form'],
    FROM_NATION: ['nation', 'nationalitat', 'land'],
    FROM_LEAGUE: ['liga'],
    FROM_CLUB: ['verein'],
    OTHER: ['chemiepunkte pro spieler', 'pro spieler', 'loyalitat', 'erstbesitzer', 'entwicklung', 'ikonen', 'helden'],
  },
  qualities: { BRONZE: ['bronze'], SILVER: ['silber'], GOLD: ['gold'] },
};
