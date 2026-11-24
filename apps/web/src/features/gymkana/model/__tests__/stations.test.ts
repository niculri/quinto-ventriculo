// A gymkana's stations from a card index: names, regions, sources, priorities, counts and the station on screen.
import { describe, expect, it } from 'vitest';
import { startRound } from '@qv/gymkana';
import { GYM_DECK, GYM_INDEX } from '../../../../test/fixtures/gymkana';
import {
  chosenStations,
  countBy,
  currentOf,
  gymkanaStations,
  stationCard,
  stationKey,
  upcomingStations,
} from '../stations';

const decks = new Set([GYM_DECK]);

describe('gymkanaStations', () => {
  it('takes the cards of the deck whose note has a name, with what its tags and fields say', () => {
    const { places, stations } = gymkanaStations(GYM_INDEX, decks, GYM_DECK);
    expect(places.regions.map((r) => r.tag)).toEqual(['orbita', 'cuello']);
    expect(stations.map((s) => [s.key, s.name, s.region, s.source, s.priority])).toEqual([
      ['gym-1:0', 'Músculo recto lateral', 'orbita', 'Atlas', 1],
      ['gym-2:0', 'Arteria carótida interna', 'cuello', 'Modelos', 1],
      ['gym-3:0', 'Glándula parótida', 'cuello', 'Atlas', 3],
    ]);
  });

  it('without its regions in the index, or with a note of another type or deck, keeps what it can', () => {
    const index = {
      ...GYM_INDEX,
      gymkanas: undefined,
      notes: [
        { ...GYM_INDEX.notes[0]!, noteTypeId: 'unknown' },
        { ...GYM_INDEX.notes[1]!, cards: [{ ord: 0, deckId: '99' }] },
        GYM_INDEX.notes[2]!,
      ],
    };
    const { places, stations } = gymkanaStations(index, decks, GYM_DECK);
    expect(places).toEqual({ regions: [], sources: [] });
    expect(stations.map((s) => [s.key, s.region, s.source])).toEqual([['gym-3:0', null, null]]);
  });
});

describe('what the cover and the round take from the stations', () => {
  const { stations } = gymkanaStations(GYM_INDEX, decks, GYM_DECK);

  it('counts by region, source and priority, and filters', () => {
    expect([...countBy(stations, 'region')]).toEqual([
      ['orbita', 1],
      ['cuello', 2],
    ]);
    expect([...countBy([{ ...stations[0]!, priority: null }], 'priority')]).toEqual([]);
    expect(
      chosenStations(stations, { regions: ['cuello'], sources: ['Atlas'], priorities: [3] }).map(
        (s) => s.key,
      ),
    ).toEqual(['gym-3:0']);
  });

  it('splits a key whose guid has «:», and finds the station on screen and the next ones', () => {
    expect(stationCard(stationKey('a:b', 2))).toEqual({ noteGuid: 'a:b', ord: 2 });
    const byKey = new Map(stations.map((s) => [s.key, s]));
    const round = startRound({
      id: 'r',
      now: new Date(0),
      stations: stations.map((s) => s.key),
      count: 0,
      seconds: 0,
      correction: 'instant',
      origin: 'cover',
      random: () => 0.999,
    });
    expect(currentOf(round, byKey)?.key).toBe('gym-1:0');
    expect(currentOf(null, byKey)).toBeNull();
    expect(currentOf({ ...round, index: 3, finished: true }, byKey)).toBeNull();
    expect(upcomingStations(round)).toEqual([
      { noteGuid: 'gym-2', ord: 0 },
      { noteGuid: 'gym-3', ord: 0 },
    ]);
  });
});
