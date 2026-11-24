// The stations' region, source and priority from their tags and fields, the filter and the saved choices.
import { describe, expect, it } from 'vitest';
import {
  defaultPreferences,
  passes,
  prioritiesOf,
  priorityOf,
  regionOf,
  restorePreferences,
  sourceOf,
} from '../stations';
import type { GymkanaPlaces } from '../stations';

const PLACES: GymkanaPlaces = {
  regions: [
    { tag: 'orbita', label: 'Órbita' },
    { tag: 'oido', label: 'Oído' },
  ],
  sources: [
    { label: 'Atlas A', tags: ['atlas_a'] },
    { label: 'Modelos', tags: ['modelo', 'tres_d'] },
  ],
};

const station = (region: string | null, source: string | null, priority: number | null) => ({
  region,
  source,
  priority,
});

describe('a station’s region, source and priority', () => {
  it('takes the first region and source whose tag it has, in any case', () => {
    expect(regionOf(['S4', 'Oido', 'orbita'], PLACES.regions)).toBe('orbita');
    expect(regionOf(['S4'], PLACES.regions)).toBeNull();
    expect(sourceOf(['TRES_D'], PLACES.sources)).toBe('Modelos');
    expect(sourceOf(['otra'], PLACES.sources)).toBeNull();
  });

  it('reads the priority field', () => {
    expect(priorityOf('1')).toBe(1);
    expect(priorityOf(' 3 ')).toBe(3);
    expect(priorityOf('4')).toBeNull();
    expect(priorityOf('')).toBeNull();
    expect(priorityOf(undefined)).toBeNull();
  });

  it('lists the priorities there are, in order', () => {
    expect(
      prioritiesOf([station(null, null, 3), station(null, null, 1), station(null, null, null)]),
    ).toEqual([1, 3]);
  });
});

describe('passes', () => {
  const filter = { regions: ['orbita'], sources: ['Atlas A'], priorities: [1] };

  it('needs the chosen region, source and priority', () => {
    expect(passes(station('orbita', 'Atlas A', 1), filter)).toBe(true);
    expect(passes(station('oido', 'Atlas A', 1), filter)).toBe(false);
    expect(passes(station('orbita', 'Modelos', 1), filter)).toBe(false);
    expect(passes(station('orbita', 'Atlas A', 3), filter)).toBe(false);
  });

  it('lets through what has no region, source or priority', () => {
    expect(passes(station(null, null, null), filter)).toBe(true);
  });
});

describe('the choices', () => {
  const stations = [station('orbita', 'Atlas A', 3), station('oido', 'Modelos', 1)];

  it('start with everything and the first priority', () => {
    expect(defaultPreferences(PLACES, stations)).toEqual({
      filter: { regions: ['orbita', 'oido'], sources: ['Atlas A', 'Modelos'], priorities: [1] },
      count: 20,
      seconds: 0,
      correction: 'instant',
    });
    expect(defaultPreferences(PLACES, []).filter.priorities).toEqual([]);
  });

  it('keep what was saved that still exists', () => {
    expect(
      restorePreferences(
        {
          filter: { regions: ['oido', 'gone'], sources: [], priorities: [3, 2] },
          count: 50,
          seconds: 30,
          correction: 'end',
        },
        PLACES,
        stations,
      ),
    ).toEqual({
      filter: { regions: ['oido'], sources: [], priorities: [3] },
      count: 50,
      seconds: 30,
      correction: 'end',
    });
  });

  it('fall back to the defaults for what is missing or wrong', () => {
    const base = defaultPreferences(PLACES, stations);
    expect(restorePreferences(null, PLACES, stations)).toEqual(base);
    expect(restorePreferences([], PLACES, stations)).toEqual(base);
    expect(
      restorePreferences(
        { filter: 'x', count: 7, seconds: -1, correction: 'later' },
        PLACES,
        stations,
      ),
    ).toEqual(base);
    expect(restorePreferences({ count: 0 }, PLACES, stations)).toEqual({ ...base, count: 0 });
  });
});
