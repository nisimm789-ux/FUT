import type { RequirementDictionary } from '../types.js';

/** Spanish. Candidate wording; confirm against the live FC 27 UI. */
export const es: RequirementDictionary = {
  locale: 'es',
  verified: false,
  operators: { min: ['min', 'minimo', 'al menos'], max: ['max', 'maximo'], exact: ['exactamente'] },
  subjects: {
    TEAM_RATING: ['valoracion del equipo', 'valoracion de equipo', 'media del equipo'],
    CHEMISTRY: ['quimica', 'quimica del equipo', 'quimica total'],
    SQUAD_SIZE: ['numero de jugadores en la plantilla', 'jugadores en la plantilla'],
    PLAYER_RATING: ['valoracion del jugador', 'valoracion de jugador', 'media del jugador'],
    PLAYER_QUALITY: ['calidad de los jugadores', 'calidad del jugador', 'calidad'],
    RARE: ['raros', 'raro', 'jugadores raros'],
    GOLD: ['jugadores oro', 'jugadores de oro'],
    SILVER: ['jugadores plata', 'jugadores de plata'],
    BRONZE: ['jugadores bronce', 'jugadores de bronce'],
    SAME_CLUB: ['mismo club', 'jugadores del mismo club'],
    SAME_LEAGUE: ['misma liga', 'jugadores de la misma liga'],
    SAME_NATION: ['misma nacionalidad', 'mismo pais', 'misma nacion'],
    UNIQUE_CLUBS: ['clubes'],
    UNIQUE_LEAGUES: ['ligas'],
    UNIQUE_NATIONS: ['nacionalidades', 'paises', 'naciones'],
    TOTW: ['equipo de la semana', 'totw'],
    TOTS: ['equipo de la temporada', 'tots'],
    IN_FORM: ['en forma'],
    FROM_NATION: ['nacionalidad', 'pais', 'nacion'],
    FROM_LEAGUE: ['liga'],
    FROM_CLUB: ['club'],
    OTHER: ['puntos de quimica por jugador', 'por jugador', 'lealtad', 'primer propietario', 'evolucion', 'iconos', 'heroes'],
  },
  qualities: { BRONZE: ['bronce'], SILVER: ['plata'], GOLD: ['oro'] },
};
