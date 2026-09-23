import { describe, expect, it } from 'vitest';
import { createRequirementInterpreter, de, en, es, fr, type RequirementEvidence } from '../src/index.js';

const interpreter = createRequirementInterpreter();
const ev = (text: string, nation: number[] = []): RequirementEvidence => ({ text, assetIds: { nation, league: [], club: [] } });

describe('requirement interpretation layer', () => {
  const cases: [string, string, unknown][] = [
    ['en', 'Team Rating: Min. 84', { type: 'MIN_SQUAD_RATING', value: 84 }],
    ['de', 'Teambewertung: Mind. 84', { type: 'MIN_SQUAD_RATING', value: 84 }],
    ['fr', "Note d'équipe : Min. 84", { type: 'MIN_SQUAD_RATING', value: 84 }],
    ['es', 'Valoración del equipo: Mín. 84', { type: 'MIN_SQUAD_RATING', value: 84 }],
    ['en', 'Total Chemistry: Min. 24', { type: 'MIN_CHEMISTRY', value: 24 }],
    ['fr', 'Collectif : Min. 24', { type: 'MIN_CHEMISTRY', value: 24 }],
    ['en', 'Team of the Week: Min. 1 Players', { type: 'MIN_COUNT', count: 1, filter: { programs: ['TOTW'] } }],
    ['es', 'Equipo de la semana: Mín. 1 jugador', { type: 'MIN_COUNT', count: 1, filter: { programs: ['TOTW'] } }],
    ['de', 'Seltene: Mind. 2 Spieler', { type: 'MIN_COUNT', count: 2, filter: { rarities: ['RARE'] } }],
    ['en', 'Same Club Count: Max. 3', { type: 'MAX_SAME', dimension: 'club', count: 3 }],
    ['fr', 'Même championnat : Min. 5', { type: 'MIN_SAME', dimension: 'league', count: 5 }],
    ['en', 'Leagues: Min. 3', { type: 'MIN_UNIQUE', dimension: 'league', count: 3 }],
    ['en', 'Clubs: Max. 5', { type: 'MAX_UNIQUE', dimension: 'club', count: 5 }],
    ['en', 'Player Quality: Min. Silver', { type: 'PLAYER_QUALITY', min: 'SILVER' }],
    ['es', 'Calidad de los jugadores: Exactamente Oro', { type: 'PLAYER_QUALITY', min: 'GOLD', max: 'GOLD' }],
    ['en', 'Gold Players: Exactly 11', { type: 'EXACT_COUNT', count: 11, filter: { qualities: ['GOLD'] } }],
    ['en', '# of Players in the Squad: 7', { type: 'SQUAD_SIZE', count: 7 }],
    ['de', 'Spielerbewertung: Mind. 65', { type: 'PLAYER_RATING_RANGE', min: 65 }],
  ];

  it.each(cases)('[%s] %s', (locale, text, expected) => {
    const result = interpreter.interpret(ev(text), locale);
    expect(result).toEqual({ ok: true, requirement: expected, locale });
  });

  it('maps named entities only through language-neutral asset ids', () => {
    expect(interpreter.interpret(ev('Nation: Min. 1 Players', [14]), 'en')).toMatchObject({ ok: true, requirement: { type: 'MIN_COUNT', filter: { nationIds: [14] } } });
    expect(interpreter.interpret(ev('Nation: Min. 1 Players'), 'en')).toMatchObject({ ok: false, reason: 'ENTITY_ID_UNAVAILABLE' });
  });

  it.each([
    ['Min. 2 Chemistry Points per Player', 'UNRECOGNIZED_TEXT'], // must NOT become total chemistry
    ['Icon Players: Min. 1', 'UNRECOGNIZED_TEXT'],
    ['Team Rating: 84 or 85', 'VALUE_UNPARSEABLE'],
    ['Rare: 2 Players', 'AMBIGUOUS_TEXT'], // no operator
    ['Rare: Min. Max. 2', 'AMBIGUOUS_TEXT'],
    ['Team Rating: Max. 84', 'AMBIGUOUS_TEXT'],
  ])('fails closed on %j (%s)', (text, reason) => {
    expect(interpreter.interpret(ev(text), 'en')).toMatchObject({ ok: false, reason });
  });

  it('refuses to guess between languages when the page language is unknown and dictionaries disagree', () => {
    // English reads "club" as a named-club requirement, Spanish as "same club".
    expect(interpreter.interpret(ev('Mismo club: Máx. 3'), null)).toMatchObject({ ok: false, reason: 'AMBIGUOUS_LANGUAGE' });
    expect(interpreter.interpret(ev('Mismo club: Máx. 3'), 'es')).toMatchObject({ ok: true, requirement: { type: 'MAX_SAME' } });
    // When all dictionaries that recognise the text agree, no page language is needed.
    expect(interpreter.interpret(ev('Team Rating: Min. 84'), null)).toMatchObject({ ok: true, requirement: { type: 'MIN_SQUAD_RATING' } });
  });

  it('dictionaries are replaceable data and marked unverified until confirmed live', () => {
    for (const d of [en, de, fr, es]) expect(d.verified).toBe(false);
    const englishOnly = createRequirementInterpreter([en]);
    expect(englishOnly.locales).toEqual(['en']);
    expect(englishOnly.interpret(ev('Teambewertung: Mind. 84'), 'de')).toMatchObject({ ok: false, reason: 'UNRECOGNIZED_TEXT' });
  });

  it('dictionary phrases are normalized (lowercase, no diacritics, no punctuation)', () => {
    for (const d of [en, de, fr, es]) {
      const phrases = [...Object.values(d.subjects).flat(), ...Object.values(d.operators).flat(), ...Object.values(d.qualities).flat()];
      for (const phrase of phrases) expect(phrase).toMatch(/^[a-z0-9]+( [a-z0-9]+)*$/);
    }
  });
});
