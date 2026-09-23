import type { RequirementDictionary } from '../types.js';

/** French. Candidate wording; confirm against the live FC 27 UI. */
export const fr: RequirementDictionary = {
  locale: 'fr',
  verified: false,
  operators: { min: ['min', 'minimum', 'au moins'], max: ['max', 'maximum', 'au plus'], exact: ['exactement'] },
  subjects: {
    TEAM_RATING: ['note d equipe', 'note de l equipe', 'note equipe', 'note collective'],
    CHEMISTRY: ['collectif', 'collectif d equipe', 'alchimie', 'alchimie d equipe'],
    SQUAD_SIZE: ['nombre de joueurs dans l equipe', 'joueurs dans l equipe'],
    PLAYER_RATING: ['note du joueur', 'note joueur'],
    PLAYER_QUALITY: ['qualite des joueurs', 'qualite du joueur', 'qualite'],
    RARE: ['rares', 'rare', 'joueurs rares'],
    GOLD: ['joueurs or', 'joueurs en or'],
    SILVER: ['joueurs argent', 'joueurs en argent'],
    BRONZE: ['joueurs bronze', 'joueurs en bronze'],
    SAME_CLUB: ['meme club', 'joueurs du meme club'],
    SAME_LEAGUE: ['meme championnat', 'meme ligue', 'joueurs du meme championnat'],
    SAME_NATION: ['meme nation', 'meme nationalite', 'meme pays'],
    UNIQUE_CLUBS: ['clubs'],
    UNIQUE_LEAGUES: ['championnats', 'ligues'],
    UNIQUE_NATIONS: ['nations', 'nationalites'],
    TOTW: ['equipe de la semaine', 'totw'],
    TOTS: ['equipe de la saison', 'tots'],
    IN_FORM: ['en forme'],
    FROM_NATION: ['nation', 'nationalite'],
    FROM_LEAGUE: ['championnat', 'ligue'],
    FROM_CLUB: ['club'],
    OTHER: ['points de collectif par joueur', 'par joueur', 'fidelite', 'premier proprietaire', 'evolution', 'icones', 'heros'],
  },
  qualities: { BRONZE: ['bronze'], SILVER: ['argent'], GOLD: ['or'] },
};
